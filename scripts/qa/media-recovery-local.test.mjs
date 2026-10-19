import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { fork, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const moduleURL = new URL('./media-recovery-local.mjs', import.meta.url);
const implementation = await import(moduleURL).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const user = '00000000-0000-0000-0000-000000000001';
const post = '00000000-0000-0000-0000-000000000002';
const scopes = [
  { provider:'r2', bucket:'synthetic-r2-media', publicRead:true },
  { provider:'r2', bucket:'synthetic-r2-catalog', publicRead:true },
  { provider:'supabase', bucket:'post-media', publicRead:false },
];
const mapping = { mediaBucket:'synthetic-r2-media', r2Origins:[
  { base:'https://media.invalid/', bucket:'synthetic-r2-media' },
  { base:'https://catalog.invalid/', bucket:'synthetic-r2-catalog' },
] };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/7sAAAAASUVORK5CYII=', 'base64');
const cleanEnv = Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','USERPROFILE'].filter(k => process.env[k]).map(k => [k,process.env[k]]));

test('actual media reference shapes resolve R2, Storage, local assets and unmanaged links separately', () => {
  assert.equal(typeof implementation.collectMediaReferences, 'function', 'local recovery reference collection must be implemented');
  const refs = implementation.collectMediaReferences({
    post_media:[{id:'media',storage_path:`tmp/${user}/${post}/video.mp4`,thumbnail_url:`${user}/${post}/thumb.png`}],
    profiles:[{id:user,avatar_url:`profile-avatars/${user}/1-avatar.png`,banner_url:'https://external.invalid/banner.png'}],
    circles:[],news_articles:[{id:'news',content:`Heading\n\n![Synthetic](news-content/${user}/inline.png)\n\tCaption`}],devices:[{id:'device',media:{images:[{url:'https://catalog.invalid/catalog/front.png'}]},product_image_url:'/images/fixture.png'}],
  },mapping);
  assert.equal(refs.managed.length,5);
  assert.equal(refs.external.length,1);
  assert.equal(refs.repository.length,1);
  assert.equal(refs.managed[0].bucket,'synthetic-r2-media');
  assert.equal(refs.managed.at(-1).bucket,'synthetic-r2-catalog');
});

test('unknown reference shapes, traversal and signed URLs fail closed', () => {
  assert.equal(typeof implementation.collectMediaReferences,'function');
  const rows = {post_media:[],profiles:[],circles:[],news_articles:[],devices:[]};
  assert.throws(()=>implementation.collectMediaReferences({...rows,profiles:[{id:user,avatar_url:'../private.png'}]},mapping));
  assert.throws(()=>implementation.collectMediaReferences({...rows,profiles:[{id:user,avatar_url:'https://external.invalid/a?token=not-a-real-token'}]},mapping));
  assert.throws(()=>implementation.collectMediaReferences({...rows,unknown_table:[]},mapping));
  assert.throws(()=>implementation.collectMediaReferences({...rows,news_articles:[{id:'news',content:'\u0000'}]},mapping),{code:'NEWS_CONTENT_BOUND'});
});

async function privateFixtureRoot() {
  const root = await mkdtemp(join(tmpdir(),'ogh-media-recovery-local-'));
  if(process.platform==='win32') {
    const identity=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{env:cleanEnv,encoding:'utf8',windowsHide:true});
    const sid=/S-1-5-\d+(?:-\d+)+/.exec(identity)?.[0];assert.ok(sid);
    execFileSync('icacls.exe',[root,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{env:cleanEnv,windowsHide:true,stdio:'pipe'});
    const command='$a=Get-Acl -LiteralPath $env:OGH_LOCAL_MEDIA_ROOT; $allowed=@($env:OGH_LOCAL_MEDIA_SID,"S-1-5-18"); if(-not $a.AreAccessRulesProtected){exit 2}; foreach($r in $a.Access){$s=$r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;if($s -notin $allowed -or $r.IsInherited -or $r.AccessControlType -ne "Allow"){exit 3}};if($a.Access.Count -ne 2){exit 4}';
    execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{env:{...cleanEnv,OGH_LOCAL_MEDIA_ROOT:root,OGH_LOCAL_MEDIA_SID:sid},windowsHide:true,stdio:'pipe'});
  }
  return root;
}

async function removeFixture(root) {
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));
  assert.ok(basename(root).startsWith('ogh-media-recovery-local-'));
  const item=await lstat(root).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(!item)return;assert.equal(item.isSymbolicLink(),false);
  await rm(root,{recursive:true,force:true});
}

async function syntheticVideo() {
  const {chromium}=await import('file:///C:/Temp/ogh-product-beta-development-20261013/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-component-update','--no-proxy-server']});
  try {
    const context=await browser.newContext({offline:true,serviceWorkers:'block'});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    // Reuse only the existing local-real-r2-cases MediaRecorder generator, not its network cases.
    const fixture=await page.evaluate(async()=>{
      const mime=['video/mp4;codecs=avc1.42001E','video/mp4;codecs=avc1.42E01E','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime)throw Error('LOCAL_VIDEO_ENCODER_UNAVAILABLE');
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
      const stream=canvas.captureStream(10),chunks=[],ctx=canvas.getContext('2d');
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:32000});
      let timer;
      try {
        const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>reject(Error('ENCODER_FAILED'));recorder.onstop=async()=>resolve(btoa(String.fromCharCode(...new Uint8Array(await new Blob(chunks).arrayBuffer()))));});
        let frame=0;recorder.start();timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#147d89':'#eeeeee';ctx.fillRect(0,0,160,90);},100);
        await new Promise(resolve=>setTimeout(resolve,1000));clearInterval(timer);recorder.stop();return {mime,base64:await done};
      } finally {clearInterval(timer);stream.getTracks().forEach(t=>t.stop());}
    });
    const bytes=Buffer.from(fixture.base64,'base64');assert.ok(bytes.length<=65536);
    assert.equal(bytes.toString('ascii',4,8),'ftyp');assert.ok(bytes.includes(Buffer.from('avcC')));
    await context.close();return bytes;
  } finally {await browser.close();}
}

function records(video) {
  const definitions=[
    ['r2','synthetic-r2-media',`tmp/${user}/${post}/video.mp4`,'video/mp4','r2-video'],
    ['supabase','post-media',`${user}/${post}/image.png`,'image/png','post-image'],
    ['supabase','post-media',`${user}/${post}/thumb.png`,'image/png','thumbnail'],
    ['supabase','post-media',`${user}/${post}/fallback.mp4`,'video/mp4','fallback-video'],
    ['supabase','post-media',`profile-avatars/${user}/1-avatar.png`,'image/png','profile-avatar'],
    ['supabase','post-media',`profile-banners/${user}/1-banner.png`,'image/png','profile-banner'],
    ['supabase','post-media',`circle-covers/${user}/1-cover.png`,'image/png','circle-cover'],
    ['supabase','post-media',`news-covers/${user}/1-cover.png`,'image/png','news-cover'],
    ['supabase','post-media',`news-content/${user}/1-inline.png`,'image/png','news-content'],
    ['r2','synthetic-r2-catalog','catalog/front.png','image/png','catalog-r2-image'],
    ['r2','synthetic-r2-media',`tmp/${user}/${post}/unreferenced.png`,'image/png','unreferenced-object'],
  ];
  return definitions.map(([provider,bucket,key,contentType,objectClass])=>({provider,bucket,key,metadata:{contentType,cacheControl:'3600',contentDisposition:'inline',contentEncoding:null,custom:{synthetic:'true',objectClass}},bytes:contentType==='video/mp4'?video:png}));
}

function references() {
  return {
    post_media:[{id:'r2-video',user_id:user,post_id:post,storage_path:`tmp/${user}/${post}/video.mp4`},{id:'image',user_id:user,post_id:post,storage_path:`${user}/${post}/image.png`,thumbnail_url:`${user}/${post}/thumb.png`},{id:'fallback',user_id:user,post_id:post,storage_path:`${user}/${post}/fallback.mp4`}],
    profiles:[{id:user,avatar_url:`profile-avatars/${user}/1-avatar.png`,banner_url:`profile-banners/${user}/1-banner.png`}],
    circles:[{id:'circle',image_path:`circle-covers/${user}/1-cover.png`}],
    news_articles:[{id:'news',cover_image_url:`news-covers/${user}/1-cover.png`,content:`![Synthetic](news-content/${user}/1-inline.png)`}],
    devices:[{id:'device',media:{images:[{url:'https://catalog.invalid/catalog/front.png'}]},product_image_url:'/images/synthetic-source-owned.png'}],
  };
}

async function freshRestore(backup,target,passphrase) {
  return new Promise((resolveResult,reject)=>{
    const child=fork(fileURLToPath(moduleURL),['restore-local',backup,target],{env:cleanEnv,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    let result,settled=false;
    const timer=setTimeout(()=>{child.kill();finish(new Error('RESTORE_CHILD_TIMEOUT'));},15000);
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolveResult(result);};
    child.on('message',message=>{result=message;});child.once('error',finish);
    child.once('close',code=>{if(code!==0||result?.status!=='PASS')finish(new Error('RESTORE_CHILD_FAILED'));else finish();});
    child.send({passphrase});
  });
}

test('independent encrypted local media backup restores bytes, keys, metadata and references with fail-closed negatives', {timeout:60000}, async t=>{
  assert.equal(typeof implementation.createLocalStore,'function','bounded local object recovery must be implemented');
  const root=await privateFixtureRoot();t.after(()=>removeFixture(root));
  const video=await syntheticVideo(),objects=records(video),rows=references(),refs=implementation.collectMediaReferences(rows,mapping);
  const source=join(root,'source'),backup=join(root,'independent-backup'),target=join(root,'restored');
  const passphrase=randomBytes(32).toString('hex');
  await implementation.createLocalStore(source,scopes,objects);
  const capture=await implementation.backupLocalMedia(source,backup,refs,passphrase);
  assert.equal(capture.objectCount,11);assert.equal(capture.referenceCount,10);
  assert.equal(capture.unreferencedCount,1);
  assert.deepEqual((await readdir(backup)).sort(),['archive.enc','key.envelope.json']);
  assert.equal((await readFile(join(backup,'archive.enc'))).includes(png),false);
  // Restore cannot accidentally fall back to the source.
  await rm(source,{recursive:true});
  const restored=await freshRestore(backup,target,passphrase);
  assert.equal(restored.objectCount,11);assert.equal(restored.referenceCount,10);
  assert.equal(restored.inventoryDigest,capture.inventoryDigest);
  const verified=await implementation.verifyLocalMedia(target,refs,capture.inventoryDigest);
  assert.equal(verified.privateObjectCount,8);
  const storageKey=implementation.objectId(objects[1]);
  await writeFile(join(target,storageKey+'.bin'),Buffer.from('CORRUPTED_SYNTHETIC_ONLY'));
  await assert.rejects(implementation.verifyLocalMedia(target,refs,capture.inventoryDigest),{code:'OBJECT_INTEGRITY'});
  await writeFile(join(target,storageKey+'.bin'),png);
  const inventoryPath=join(target,'inventory.json'),inventoryBytes=await readFile(inventoryPath);
  const drift=JSON.parse(inventoryBytes);drift.objects[0].metadata.contentType='application/octet-stream';
  await writeFile(inventoryPath,JSON.stringify(drift));
  await assert.rejects(implementation.verifyLocalMedia(target,refs,capture.inventoryDigest),{code:'REFERENCE_SNAPSHOT_MISMATCH'});
  await writeFile(inventoryPath,inventoryBytes);
  const extra=join(target,'unlisted-synthetic.bin');await writeFile(extra,png);
  await assert.rejects(implementation.verifyLocalMedia(target,refs,capture.inventoryDigest),{code:'INVENTORY_INCOMPLETE'});
  await rm(extra);
  const omitted=JSON.parse(inventoryBytes);omitted.objects.pop();await writeFile(inventoryPath,JSON.stringify(omitted));
  await assert.rejects(implementation.verifyLocalMedia(target,refs,capture.inventoryDigest),{code:'INVENTORY_INCOMPLETE'});
  await writeFile(inventoryPath,inventoryBytes);
  await rm(join(target,storageKey+'.bin'));
  await assert.rejects(implementation.verifyLocalMedia(target,refs,capture.inventoryDigest),{code:'INVENTORY_INCOMPLETE'});
  await writeFile(join(target,storageKey+'.bin'),png);
  const missingRef=structuredClone(refs);missingRef.managed[0].key='tmp/missing.mp4';
  await assert.rejects(implementation.verifyLocalMedia(target,missingRef,capture.inventoryDigest),{code:'REFERENCE_OBJECT_MISSING'});
  const changed=structuredClone(refs);changed.managed[0].rowId='DIFFERENT_DATABASE_SNAPSHOT';
  await assert.rejects(implementation.verifyLocalMedia(target,changed,capture.inventoryDigest),{code:'REFERENCE_SNAPSHOT_MISMATCH'});
  const corruptTarget=join(root,'corrupt-restore');
  await assert.rejects(implementation.restoreLocalMedia(backup,corruptTarget,'Deliberately-wrong-synthetic-passphrase'));
  await assert.rejects(lstat(corruptTarget),{code:'ENOENT'});
  const encrypted=await readFile(join(backup,'archive.enc'));encrypted[24]^=1;await writeFile(join(backup,'archive.enc'),encrypted);
  await assert.rejects(implementation.restoreLocalMedia(backup,corruptTarget,passphrase));
  await assert.rejects(lstat(corruptTarget),{code:'ENOENT'});
  const report={task:'PUBLIC_BETA_MEDIA_RECOVERY_PROTECTION_V1',status:'MEDIA_LOCAL_RECOVERY_ACCEPTANCE_PASS',objectCount:11,managedReferenceCount:10,objectClasses:objects.map(o=>o.metadata.custom.objectClass),inventoryDigest:capture.inventoryDigest,videoBytes:video.length,videoEncoding:'H264_MP4_SYNTHETIC_LOCAL_MEDIABROWSER_ENCODER',sourceDeletedBeforeRestore:true,restoreProcess:'FRESH_NODE_PROCESS',acl:process.platform==='win32'?'CURRENT_USER_AND_SYSTEM_ONLY_VERIFIED':'PRIVATE_LOCAL_TMP',backupIntegrity:'AEAD_AND_SHA256_READBACK',negatives:['RESTORED_CORRUPTION','MISSING_OBJECT','METADATA_DRIFT','UNLISTED_OBJECT','OMITTED_INVENTORY_OBJECT','MISSING_REFERENCED_KEY','REFERENCE_SNAPSHOT_DRIFT','WRONG_RECOVERY_PASSPHRASE','CIPHERTEXT_CORRUPTION_BEFORE_TARGET_CREATION'],productionObjectsAccessed:0,productionConnections:0,productionWrites:0,realMediaRecoverability:'NOT_VERIFIED',databaseBackupRecoverability:'NOT_VERIFIED',independentOffsiteRetention:'NOT_VERIFIED',privateProviderAccessControls:'NOT_TESTED_LOCAL_FILESYSTEM_ONLY'};
  await removeFixture(root);
  // The earlier teardown tolerates already-absent exact owned roots.
  const out=process.env.OGH_MEDIA_LOCAL_RECEIPT;
  if(out){assert.equal(dirname(resolve(out)),resolve(process.platform==='win32'?'C:/Temp':tmpdir()));assert.match(basename(out),/^ogh-media-recovery-local-[a-z0-9-]+\.safe\.json$/);const bytes=Buffer.from(JSON.stringify({...report,cleanup:'VERIFIED_TEMP_ROOT_ABSENT'},null,2)+'\n');const file=await import('node:fs/promises').then(fs=>fs.open(out,'wx',0o600));try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}assert.deepEqual(await readFile(out),bytes);}
  t.diagnostic(JSON.stringify(report));
});
