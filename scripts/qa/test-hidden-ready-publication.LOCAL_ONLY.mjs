import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {receiveReleasePassword} from 'file:///C:/Temp/ogh-admin-evidence-adapter-20261022/release-password-memory.mjs';

const pwsh='C:/Users/1/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
const original='C:/Temp/ogh-admin-evidence-adapter-20261022/capture-release-password-memory.ps1';
const candidate=new URL('./capture-release-password-memory.v2.ps1',import.meta.url);
const root=path.join(process.env.LOCALAPPDATA,'OpenGlassHub','mailbox-e9f2a410-6cc1-4197-a5f3-256e9c157302','remaining-closure-delta-v1','0566dcff-ee39-4efb-a21a-a34d8d3ca460');
const q=s=>"'"+s.replaceAll("'","''")+"'";

async function publication(source,expectAtomic){
 const directory=await fs.mkdtemp(path.join(root,'offline-ready-'));
 const file=path.join(directory,'ready.json');
 const start=source.indexOf('    $ready=[Text.Encoding]');
 const end=source.indexOf('    if($OfflineFixture)',start);
 assert(start>=0&&end>start);
 let block=source.slice(start,end);
 block=block.replace('$stream.Flush($true)','$stream.Flush($true); [Console]::WriteLine("FIXTURE_WRITE_LOCK_HELD"); [Console]::Out.Flush(); Start-Sleep -Milliseconds 500');
 const command=`$ErrorActionPreference='Stop';$directory=${q(directory)};$Binding='${'0'.repeat(64)}';$Nonce='${randomUUID()}';$PIDValue=$PID;${block};[Console]::WriteLine('FIXTURE_PUBLISHED')`;
 const child=spawn(pwsh,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const closed=once(child,'close');child.stderr.resume();let output='';
 const lock=new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.on('data',b=>{output+=b.toString();if(output.includes('FIXTURE_WRITE_LOCK_HELD'))resolve();});child.once('close',()=>reject(Error('FIXTURE_NO_LOCK_SIGNAL')));});
 const timer=setTimeout(()=>child.kill(),8000);
 try{
  await lock;
  const names=await fs.readdir(directory),readyName=names.find(n=>n.endsWith('.ready.safe.json'));
  if(expectAtomic){assert.equal(readyName,undefined,'READY_MUST_NOT_EXIST_BEFORE_STREAM_CLOSE');}
  else{
   assert(readyName);await assert.rejects(fs.readFile(path.join(directory,readyName)),e=>['EBUSY','EACCES','EPERM'].includes(e.code),'ORIGINAL_READER_MUST_FAIL_ON_EXCLUSIVE_WRITER');
  }
  assert.equal((await closed)[0],0);
  const published=(await fs.readdir(directory)).filter(n=>n.endsWith('.ready.safe.json'));
  assert.equal(published.length,1);const value=JSON.parse(await fs.readFile(path.join(directory,published[0]),'utf8'));
  assert.equal(value.binding,'0'.repeat(64));assert.equal(value.status,'LOCAL_CURRENT_USER_PIPE_READY');assert.equal(value.productionRequests,0);
  assert.equal((await fs.readdir(directory)).some(n=>n.endsWith('.publishing')),false);
 }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();await closed.catch(()=>{});for(const name of await fs.readdir(directory))await fs.unlink(path.join(directory,name));await fs.rmdir(directory);}
}

test('actual Windows exclusive READY writer reproduces the original reader failure',{timeout:12000},async()=>publication(await fs.readFile(original,'utf8'),false));
test('READY is exposed only after complete safe bytes and closed handle',{timeout:12000},async()=>publication(await fs.readFile(candidate,'utf8'),true));

test('real v2 CurrentUser pipe transfers only a fictitious credential and closes',{timeout:12000},async()=>{
 const directory=await fs.mkdtemp(path.join(root,'offline-pipe-')),nonce=randomUUID(),binding='0'.repeat(64);
 const end=new Date(Date.now()+20000).toISOString(),pipeName='OGHReleasePassword-Fixture-'+nonce;
 const child=spawn(pwsh,['-NoProfile','-NonInteractive','-File',fileURLToPath(candidate),'-PipeName',pipeName,'-Binding',binding,'-Nonce',nonce,'-WindowEndUTC',end,'-StatusDirectory',directory,'-OfflineFixture'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();const closed=once(child,'close'),timer=setTimeout(()=>child.kill(),8000);let vault;
 try{
  const file=path.join(directory,'hidden-input.'+nonce+'.ready.safe.json'),deadline=Date.now()+5000;let ready;
  for(;;){try{ready=JSON.parse(await fs.readFile(file,'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;assert(Date.now()<deadline,'FIXTURE_READY_DEADLINE');await new Promise(r=>setTimeout(r,10));}}
  assert.equal(ready.binding,binding);assert.equal(ready.nonce,nonce);assert.equal(ready.status,'LOCAL_CURRENT_USER_PIPE_READY');
  vault=await receiveReleasePassword({pipeName,binding,nonce,windowEndUTC:end,timeoutMs:3000});
  const config=await vault.configForStage('postverify');assert.equal(config.password,'NONSECRET_LOCAL_FIXTURE_@:/?#%+_unicode_\u6D4B');config.password=null;vault.dispose();vault=null;
  assert.equal((await closed)[0],0);assert(!(await fs.readFile(file,'utf8')).includes('NONSECRET_LOCAL_FIXTURE'));
 }finally{vault?.dispose();clearTimeout(timer);if(child.exitCode===null)child.kill();await closed.catch(()=>{});for(const file of await fs.readdir(directory))await fs.unlink(path.join(directory,file));await fs.rmdir(directory);}
});

test('atomic publish cannot overwrite an existing READY marker',{timeout:12000},async()=>{
 const directory=await fs.mkdtemp(path.join(root,'offline-conflict-')),nonce=randomUUID();
 const file=path.join(directory,'hidden-input.'+nonce+'.ready.safe.json');const prior=Buffer.from('NONSECRET_OLD_MARKER');await fs.writeFile(file,prior,{flag:'wx'});
 const source=await fs.readFile(candidate,'utf8'),start=source.indexOf('    $ready=[Text.Encoding]'),end=source.indexOf('    if($OfflineFixture)',start);
 const child=spawn(pwsh,['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';$directory=${q(directory)};$Binding='${'0'.repeat(64)}';$Nonce='${nonce}';${source.slice(start,end)}`],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();
 try{assert.notEqual((await once(child,'close'))[0],0);assert.deepEqual(await fs.readFile(file),prior);}
 finally{for(const f of await fs.readdir(directory))await fs.unlink(path.join(directory,f));await fs.rmdir(directory);}
});

async function startProcessFixture(quoted){
 const directory=await fs.mkdtemp(path.join(root,'offline-launch-')),nonce=randomUUID(),binding='0'.repeat(64);
 const end=new Date(Date.now()+20000).toISOString(),pipeName='OGHReleasePassword-Fixture-'+nonce;
 const args=['-NoProfile','-NonInteractive','-File',fileURLToPath(candidate),'-PipeName',pipeName,'-Binding',binding,'-Nonce',nonce,'-WindowEndUTC',end,'-StatusDirectory',directory,'-OfflineFixture'];
 const argumentsText=args.map(s=>q(quoted?'"'+s+'"':s)).join(',');
 const out=path.join(directory,'stdout.txt'),err=path.join(directory,'stderr.txt');
 const command=`$ErrorActionPreference='Stop';$p=Start-Process -FilePath ${q(pwsh)} -ArgumentList @(${argumentsText}) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput ${q(out)} -RedirectStandardError ${q(err)};exit $p.ExitCode`;
 const child=spawn(pwsh,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();const closed=once(child,'close'),timer=setTimeout(()=>child.kill(),10000);let vault;
 try{
  const ready=path.join(directory,'hidden-input.'+nonce+'.ready.safe.json');
  if(!quoted){
   assert.notEqual((await closed)[0],0);await assert.rejects(fs.stat(ready),e=>e.code==='ENOENT');
   const diagnostic=await fs.readFile(err,'utf8');
   assert(diagnostic.includes(fileURLToPath(candidate).split(' ')[0]),'CHILD_ERROR_IDENTIFIES_TRUNCATED_SCRIPT_PATH');
  }else{
   const deadline=Date.now()+6000;let value;
   for(;;){try{value=JSON.parse(await fs.readFile(ready,'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;assert(Date.now()<deadline,'QUOTED_READY_DEADLINE');await new Promise(r=>setTimeout(r,20));}}
   assert.equal(value.binding,binding);assert.equal(value.nonce,nonce);
   vault=await receiveReleasePassword({pipeName,binding,nonce,windowEndUTC:end,timeoutMs:3000});
   const config=await vault.configForStage('postverify');assert.equal(config.password,'NONSECRET_LOCAL_FIXTURE_@:/?#%+_unicode_\u6D4B');config.password=null;vault.dispose();vault=null;
   assert.equal((await closed)[0],0);
  }
 }finally{vault?.dispose();clearTimeout(timer);if(child.exitCode===null)child.kill();await closed.catch(()=>{});for(const f of await fs.readdir(directory))await fs.unlink(path.join(directory,f));await fs.rmdir(directory);}
}

test('actual Start-Process unquoted argument array splits the space-containing helper path',{timeout:15000},()=>startProcessFixture(false));
test('quoted Start-Process arguments preserve the path and fictitious CurrentUser pipe',{timeout:15000},()=>startProcessFixture(true));
