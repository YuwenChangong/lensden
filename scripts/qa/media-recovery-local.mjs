import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, lstat, readdir } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { isRetainedR2VideoPath } from '../../src/lib/r2-media-path.ts';

// A bounded synthetic filesystem proof, deliberately without provider clients,
// environment configuration, production credentials or a cloud execution path.
export const LIMITS = Object.freeze({objects:64,objectBytes:65536,totalBytes:2097152,archiveBytes:4194304,references:256});
const FORMAT='OGH_SYNTHETIC_MEDIA_ONLY_V1';
const CORE='C:/Temp/ogh-manual-backup-preparation-20261010-v5/backup-core.mjs';
const CORE_SHA='fc81611f50dce53c15222cdbb7807a608b4cefd7ae8f95fb286c2ad0b04dd375';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const requireThat=(condition,code)=>{if(!condition)fail(code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>sha(Buffer.from(JSON.stringify(canonical(value))));
export const objectId=object=>digest([object.provider,object.bucket,object.key]);
const keyValid=key=>typeof key==='string'&&key.length>0&&key.length<=512&&/^[a-zA-Z0-9._/-]+$/.test(key)&&key.split('/').every(p=>p&&p!=='.'&&p!=='..');
const textValid=value=>typeof value==='string'&&value.length<=1024&&!/[\u0000-\u001f\u007f]/.test(value);
function scopeValid(scope){requireThat(['r2','supabase'].includes(scope?.provider)&&/^[a-z0-9][a-z0-9-]{0,62}$/.test(scope.bucket)&&typeof scope.publicRead==='boolean','STORAGE_SCOPE_INVALID');}
function recordValid(record,scopes){
  requireThat(record&&keyValid(record.key),'OBJECT_KEY_INVALID');
  requireThat(scopes.some(s=>s.provider===record.provider&&s.bucket===record.bucket),'OBJECT_SCOPE_UNKNOWN');
  const m=record.metadata;requireThat(m&&Object.keys(m).sort().join(',')==='cacheControl,contentDisposition,contentEncoding,contentType,custom','OBJECT_METADATA_INCOMPLETE');
  requireThat(textValid(m.contentType)&&/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(m.contentType),'CONTENT_TYPE_INVALID');
  requireThat(['cacheControl','contentDisposition','contentEncoding'].every(k=>m[k]===null||textValid(m[k])),'HTTP_METADATA_INVALID');
  requireThat(m.custom&&Object.getPrototypeOf(m.custom)===Object.prototype&&Object.keys(m.custom).length<=16&&Object.entries(m.custom).every(([k,v])=>/^[a-zA-Z0-9_-]{1,64}$/.test(k)&&textValid(v)),'CUSTOM_METADATA_INVALID');
}

export function collectMediaReferences(rows,mapping){
  const tables=['post_media','profiles','circles','news_articles','devices'];
  requireThat(rows&&Object.keys(rows).sort().join(',')===[...tables].sort().join(',')&&tables.every(t=>Array.isArray(rows[t])&&rows[t].length<=LIMITS.references),'REFERENCE_SCOPE_UNKNOWN');
  requireThat(mapping&&Array.isArray(mapping.r2Origins)&&mapping.r2Origins.length<=4,'R2_MAPPING_REQUIRED');
  const bases=mapping.r2Origins.map(s=>{scopeValid({provider:'r2',bucket:s.bucket,publicRead:true});const url=new URL(s.base);requireThat(url.protocol==='https:'&&!url.search&&!url.hash&&!url.username&&!url.password,'R2_BASE_INVALID');return {...s,url};});
  requireThat(bases.some(s=>s.bucket===mapping.mediaBucket),'R2_MEDIA_MAPPING_REQUIRED');
  const result={managed:[],repository:[],external:[]};
  function add(table,rowId,column,value){
    if(value===null||value===undefined||value==='')return;
    requireThat(textValid(rowId)&&textValid(value)&&value.trim()===value,'REFERENCE_VALUE_INVALID');
    const reference={table,rowId,column};
    if(value.startsWith('/images/')||value.startsWith('/assets/')){requireThat(keyValid(value.slice(1)),'REPOSITORY_ASSET_INVALID');result.repository.push({...reference,path:value});return;}
    let key=value,provider='supabase',bucket='post-media';
    if(/^https?:\/\//i.test(value)){
      const url=new URL(value);requireThat(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,'REFERENCE_URL_UNSAFE');
      const matching=bases.filter(s=>url.origin===s.url.origin&&url.pathname.startsWith(s.url.pathname.replace(/\/$/,'')+'/'));
      requireThat(matching.length<=1,'R2_MAPPING_AMBIGUOUS');
      if(!matching.length){result.external.push({...reference,url:value});return;}
      const base=matching[0];key=decodeURIComponent(url.pathname.slice(base.url.pathname.replace(/\/$/,'').length+1));provider='r2';bucket=base.bucket;
    }else if(value.startsWith('tmp/')||isRetainedR2VideoPath(value)){provider='r2';bucket=mapping.mediaBucket;}
    requireThat(keyValid(key),'REFERENCE_KEY_INVALID');
    if(provider==='supabase')requireThat(/^(?:[a-f0-9-]{36}\/[a-f0-9-]{36}\/|profile-avatars\/|profile-banners\/|circle-covers\/|news-covers\/|news-content\/)/.test(key),'REFERENCE_KEY_CLASS_UNKNOWN');
    result.managed.push({...reference,provider,bucket,key});
  }
  for(const row of rows.post_media){add('post_media',row.id,'storage_path',row.storage_path);add('post_media',row.id,'url',row.url);add('post_media',row.id,'thumbnail_url',row.thumbnail_url);}
  for(const row of rows.profiles){add('profiles',row.id,'avatar_url',row.avatar_url);add('profiles',row.id,'banner_url',row.banner_url);}
  for(const row of rows.circles)add('circles',row.id,'image_path',row.image_path);
  for(const row of rows.news_articles){
    add('news_articles',row.id,'cover_image_url',row.cover_image_url);
    requireThat(row.content===undefined||(typeof row.content==='string'&&Buffer.byteLength(row.content)<=65536&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(row.content)),'NEWS_CONTENT_BOUND');
    for(const [i,line]of (row.content??'').split(/\r?\n/).entries()){const match=/^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());if(match)add('news_articles',row.id,'content:'+i,match[2].trim());}
  }
  for(const row of rows.devices){add('devices',row.id,'product_image_url',row.product_image_url);add('devices',row.id,'official_image_url',row.official_image_url);add('devices',row.id,'media.imageUrl',row.media?.imageUrl);requireThat(row.media?.images===undefined||(Array.isArray(row.media.images)&&row.media.images.length<=20),'DEVICE_IMAGE_SCOPE');for(const [i,image]of (row.media?.images??[]).entries())add('devices',row.id,'media.images:'+i,image.url);}
  requireThat(Object.values(result).reduce((n,a)=>n+a.length,0)<=LIMITS.references,'REFERENCE_COUNT_BOUND');return result;
}

async function localPath(path){
  const full=resolve(path),parent=dirname(full);
  requireThat(dirname(parent)===resolve(tmpdir())&&basename(parent).startsWith('ogh-media-recovery-local-'),'LOCAL_SYNTHETIC_PATH_REQUIRED');
  requireThat(['source','independent-backup','restored','corrupt-restore'].includes(basename(full)),'LOCAL_DESTINATION_UNKNOWN');
  const root=await lstat(parent);requireThat(root.isDirectory()&&!root.isSymbolicLink(),'LOCAL_ROOT_BOUNDARY');return full;
}
async function regularRead(path,max){const info=await lstat(path);requireThat(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size<=max,'LOCAL_FILE_BOUND');const bytes=await readFile(path);requireThat(bytes.length===info.size,'LOCAL_FILE_CHANGED');return bytes;}
async function durable(path,bytes){const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}requireThat((await readFile(path)).equals(bytes),'DURABLE_READBACK_FAILED');}
async function storeRoot(path){const full=await localPath(path),stat=await lstat(full);requireThat(stat.isDirectory()&&!stat.isSymbolicLink(),'OBJECT_STORE_BOUNDARY');return full;}
function validateReferences(refs,records){
  requireThat(refs&&Object.keys(refs).sort().join(',')==='external,managed,repository'&&Object.values(refs).every(Array.isArray)&&Object.values(refs).reduce((n,a)=>n+a.length,0)<=LIMITS.references,'REFERENCE_MANIFEST_INVALID');
  const ids=new Set(records.map(objectId));
  for(const ref of refs.managed)requireThat(keyValid(ref.key)&&ids.has(objectId(ref)),'REFERENCE_OBJECT_MISSING');
}
function validateInventory(index){
  requireThat(index?.format===FORMAT&&Array.isArray(index.scopes)&&index.scopes.length>0&&index.scopes.length<=4&&Array.isArray(index.objects)&&index.objects.length>0&&index.objects.length<=LIMITS.objects,'INVENTORY_BOUND');
  index.scopes.forEach(scopeValid);requireThat(new Set(index.scopes.map(s=>s.provider+':'+s.bucket)).size===index.scopes.length,'DUPLICATE_SCOPE');
  index.objects.forEach(o=>{recordValid(o,index.scopes);requireThat(Number.isSafeInteger(o.size)&&o.size>0&&o.size<=LIMITS.objectBytes&&/^[a-f0-9]{64}$/.test(o.sha256),'OBJECT_MANIFEST_INVALID');});
  requireThat(new Set(index.objects.map(objectId)).size===index.objects.length,'DUPLICATE_OBJECT');
  requireThat(index.objects.reduce((n,o)=>n+o.size,0)<=LIMITS.totalBytes,'INVENTORY_BYTE_BOUND');
}
export async function createLocalStore(path,scopes,objects){
  const root=await localPath(path);
  const index={format:FORMAT,scopes,objects:objects.map(({bytes,...o})=>({...o,size:bytes.length,sha256:sha(bytes)}))};validateInventory(index);
  await mkdir(root,{mode:0o700});
  for(const object of objects)await durable(join(root,objectId(object)+'.bin'),object.bytes);
  await durable(join(root,'inventory.json'),Buffer.from(JSON.stringify(index)));
}
async function readStore(path){
  const root=await storeRoot(path),index=JSON.parse((await regularRead(join(root,'inventory.json'),262144)).toString('utf8'));validateInventory(index);
  const expected=['inventory.json',...index.objects.map(o=>objectId(o)+'.bin')].sort();
  requireThat(JSON.stringify((await readdir(root)).sort())===JSON.stringify(expected),'INVENTORY_INCOMPLETE');
  const objects=[];
  for(const record of index.objects){const bytes=await regularRead(join(root,objectId(record)+'.bin'),LIMITS.objectBytes);requireThat(bytes.length===record.size&&sha(bytes)===record.sha256,'OBJECT_INTEGRITY');objects.push({...record,base64:bytes.toString('base64')});}
  return {index,objects};
}
async function cryptoCore(){requireThat(sha(await readFile(CORE))===CORE_SHA,'CRYPTO_PIN_DRIFT');return import(pathToFileURL(CORE).href);}
function completeDigest(index,refs){return digest({index,refs});}
export async function backupLocalMedia(source,backup,refs,passphrase){
  requireThat(resolve(source)!==resolve(backup),'INDEPENDENT_BACKUP_REQUIRED');
  const snapshot=await readStore(source);validateReferences(refs,snapshot.index.objects);
  const archive={format:FORMAT,index:snapshot.index,objects:snapshot.objects,refs};
  const plaintext=Buffer.from(JSON.stringify(archive));requireThat(plaintext.length<=LIMITS.archiveBytes,'ARCHIVE_BOUND');
  const core=await cryptoCore(),root=await localPath(backup),key=randomBytes(32);
  try{
    await mkdir(root,{mode:0o700});await durable(join(root,'key.envelope.json'),Buffer.from(JSON.stringify(core.wrapKey(key,passphrase))));
    await core.encryptStream(Readable.from([plaintext]),join(root,'archive.enc'),key,{signal:AbortSignal.timeout(10000)});
    const preserved=await regularRead(join(root,'archive.enc'),LIMITS.archiveBytes+36);
    requireThat(preserved.length===plaintext.length+36,'ARCHIVE_PERSISTENCE');
    await core.authenticatedReplay(join(root,'archive.enc'),key,()=>new Writable({write(_,__,cb){cb();}}),{signal:AbortSignal.timeout(10000)});
    const after=await readStore(source);requireThat(digest(snapshot)===digest(after),'SOURCE_SNAPSHOT_CHANGED');
    return {objectCount:snapshot.objects.length,referenceCount:refs.managed.length,unreferencedCount:snapshot.objects.filter(o=>!refs.managed.some(r=>objectId(r)===objectId(o))).length,inventoryDigest:completeDigest(snapshot.index,refs),ciphertextSha256:sha(preserved)};
  }finally{key.fill(0);plaintext.fill(0);}
}
export async function restoreLocalMedia(backup,target,passphrase){
  requireThat(resolve(backup)!==resolve(target),'INDEPENDENT_RESTORE_REQUIRED');
  const root=await storeRoot(backup);requireThat(JSON.stringify((await readdir(root)).sort())===JSON.stringify(['archive.enc','key.envelope.json']),'BACKUP_INVENTORY_INCOMPLETE');
  await regularRead(join(root,'archive.enc'),LIMITS.archiveBytes+36);
  const core=await cryptoCore(),key=core.unwrapKey(JSON.parse((await regularRead(join(root,'key.envelope.json'),4096)).toString('utf8')),passphrase);
  let buffers=[],bytes=0;
  try{
    await core.authenticatedReplay(join(root,'archive.enc'),key,()=>new Writable({write(b,_,cb){bytes+=b.length;if(bytes>LIMITS.archiveBytes){cb(Object.assign(new Error('ARCHIVE_BOUND'),{code:'ARCHIVE_BOUND'}));return;}buffers.push(Buffer.from(b));cb();}}),{signal:AbortSignal.timeout(10000)});
    const archive=JSON.parse(Buffer.concat(buffers).toString('utf8'));validateInventory(archive.index);
    requireThat(archive.format===FORMAT&&Array.isArray(archive.objects)&&archive.objects.length===archive.index.objects.length,'ARCHIVE_MANIFEST_INVALID');
    const records=archive.objects.map((o,i)=>{const record=archive.index.objects[i];requireThat(digest({...o,base64:undefined})===digest(record)&&typeof o.base64==='string','ARCHIVE_OBJECT_METADATA');const b=Buffer.from(o.base64,'base64');requireThat(b.toString('base64')===o.base64&&b.length===record.size&&sha(b)===record.sha256,'ARCHIVE_OBJECT_INTEGRITY');return {...record,bytes:b};});
    validateReferences(archive.refs,records);
    await createLocalStore(target,archive.index.scopes,records);
    return verifyLocalMedia(target,archive.refs,completeDigest(archive.index,archive.refs));
  }finally{key.fill(0);for(const b of buffers)b.fill(0);}
}
export async function verifyLocalMedia(target,refs,expectedDigest){
  const restored=await readStore(target);validateReferences(refs,restored.index.objects);
  requireThat(completeDigest(restored.index,refs)===expectedDigest,'REFERENCE_SNAPSHOT_MISMATCH');
  return {status:'PASS',objectCount:restored.objects.length,referenceCount:refs.managed.length,inventoryDigest:expectedDigest,privateObjectCount:restored.objects.filter(o=>restored.index.scopes.find(s=>s.provider===o.provider&&s.bucket===o.bucket).publicRead===false).length};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==5||process.argv[2]!=='restore-local'||!process.send)fail('ISOLATED_LOCAL_RESTORE_ONLY');
  const timer=setTimeout(()=>{process.exitCode=1;process.disconnect();},15000);
  process.once('message',async message=>{clearTimeout(timer);try{requireThat(typeof message?.passphrase==='string'&&message.passphrase.length>=20,'LOCAL_PASSPHRASE_REQUIRED');const result=await restoreLocalMedia(process.argv[3],process.argv[4],message.passphrase);process.send(result,()=>process.disconnect());}catch{process.exitCode=1;process.send({status:'FAIL'},()=>process.disconnect());}});
}
