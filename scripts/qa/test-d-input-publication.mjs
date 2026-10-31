import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {dHash} from './d-execution-journal.mjs';
import {startDInputCoordinator,publishDInputRecord,assertDInputAdmissionActive,publishDInputAdmission} from './d-input-coordination.mjs';
import {receiveDConfirmedHeadCredentials} from './d-execution-runtime.mjs';

function fixture(t,options={},root=os.tmpdir()) {
  const directory=fs.mkdtempSync(path.join(root,'ogh-input-publication-'));
  t.after(()=>{assert.equal(path.dirname(directory),root);
    assert.match(path.basename(directory),/^ogh-input-publication-/);fs.rmSync(directory,{recursive:true});});
  const nonce=randomUUID(),binding='7'.repeat(64),runId=randomUUID();
  const context={mode:'SYNTHETIC',directory,nonce,binding,runId,tokenLabel:'FICTITIOUS_ONLY',
    deadlineUtc:new Date(Date.now()+10000).toISOString(),pollMs:5,...options};
  const ref=(file,value)=>{publishDInputRecord(file,value);return {path:file,sha256:dHash(fs.readFileSync(file))};};
  const at=name=>path.join(directory,name);
  const enter=ref(at(`OWNER_ENTER.${nonce}.safe.json`),{binding,nonce,currentPreparationConfirmed:true,tokenNotYetCreated:true});
  const gates=ref(at(`D_RUNTIME_ADMISSION.owner-enter.${nonce}.safe.json`),{
    sourceAdoptionSha256:binding,ownerReadyUtc:new Date().toISOString(),ownerPreparationRef:enter});
  const prepared=ref(at(`D.plan.owner-enter.${nonce}.private.json`),{schemaVersion:1,
    account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',project:'xcbnxzjlsvtgzixurcof',
    runId,directory,sourceAdoption:{sha256:binding},tokenLabel:context.tokenLabel,runtimeAdmission:gates,
    remainingCaps:{Auth:11,REST:12,Worker:12,HEAD:6,management:2}});
  const parameters={binding,nonce,planPath:prepared.path,account:'dcb374166b39234a499985145c075f50',
    bucket:'openglasshub-media',tokenLabel:context.tokenLabel,permission:'object-read-only',ttlHours:24,
    tokenCreated:false,deadlineUtc:new Date(Date.now()+5000).toISOString()};
  const ready={schemaVersion:1,binding,nonce,pid:1234,status:'LOCAL_CURRENT_USER_PIPE_READY',productionRequests:0};
  const terminal={kind:'LOCAL_INPUT_TERMINAL_NOT_D_PASS',binding,nonce,phase:'CAPTURE_COMPLETE',status:'LOCAL_TRANSFER_REPORTED'};
  return {directory,nonce,binding,runId,context,at,parameters,ready,terminal,ref};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate) {const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('FIXTURE_TIMEOUT');await pause(5);}}
function admit(f) {
  publishDInputRecord(f.at(`HEAD_INPUT.${f.nonce}.parameters.safe.json`),f.parameters);
  publishDInputRecord(f.at(`head-input.${f.nonce}.ready.safe.json`),f.ready);
}

test('input publication: actual poller waits for staging and continues after a complete terminal, then native exit',async t=>{
  const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());
  const terminalPath=f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`);
  fs.writeFileSync(terminalPath+'.publishing','{"unfinished":');
  await pause(20);assert.equal(control.state().status,'WAITING');
  fs.unlinkSync(terminalPath+'.publishing');admit(f);
  const native=f.at(`D.plan.native-input.${f.nonce}.private.json`);
  await waitFor(()=>fs.existsSync(native));
  const plan=JSON.parse(fs.readFileSync(native));
  assert.equal(plan.credentialInput.expectedPid,1234);assert.equal(plan.credentialInput.nonce,f.nonce);
  assert.equal(plan.supplierConfirmation.path,f.at(`supplier-confirmation.${f.nonce}.safe.json`));
  publishDInputRecord(terminalPath,f.terminal);
  await pause(20);assert.equal(control.state().status,'WAITING_SUPPLIER_OR_NATIVE_EXIT');
  assert.equal(fs.existsSync(f.at(`COORDINATOR_FAILURE.${f.nonce}.safe.json`)),false);
  publishDInputRecord(f.at(`WORKSPACE_NATIVE_EXIT.${f.nonce}.safe.json`),{
    kind:'ACTUAL_NATIVE_EXIT_NOT_CLEANUP_PASS',binding:f.binding,nonce:f.nonce,exitCode:0,supervisionUnknown:false});
  const result=await control.done;
  assert.equal(result.status,'LOCAL_NATIVE_EXIT');assert.equal(result.productionPass,false);
  assert.equal(result.providerRequests,0);
});

test('input publication: malformed final receipt stops once with a safe stage and separate failure receipt',async t=>{
  const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());
  const terminalPath=f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`);
  fs.writeFileSync(terminalPath,'{malformed');
  const result=await control.done;
  assert.equal(result.status,'STOPPED');assert.equal(result.stage,'TERMINAL_READ');
  assert.equal(result.reason,'MALFORMED_JSON');assert.equal(fs.readFileSync(terminalPath,'utf8'),'{malformed');
  assert.equal(JSON.parse(fs.readFileSync(f.at(`COORDINATOR_FAILURE.${f.nonce}.safe.json`))).reason,'MALFORMED_JSON');
});

test('input publication: wrong terminal identity is never accepted as completion',async t=>{
  const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());
  publishDInputRecord(f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`),{...f.terminal,nonce:randomUUID()});
  const result=await control.done;assert.equal(result.status,'STOPPED');assert.equal(result.stage,'TERMINAL_BINDING');
});

test('input publication: premature native success or nonzero exit never becomes completion',async t=>{
  for(const exitCode of [0,1]) {
    const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());
    publishDInputRecord(f.at(`WORKSPACE_NATIVE_EXIT.${f.nonce}.safe.json`),{
      kind:'ACTUAL_NATIVE_EXIT_NOT_CLEANUP_PASS',binding:f.binding,nonce:f.nonce,exitCode,supervisionUnknown:false});
    const result=await control.done;
    assert.equal(result.status,'STOPPED');
    assert.equal(result.reason,exitCode===0?'NATIVE_EXIT_PREMATURE':'NATIVE_EXIT_FAILED');
  }
});

test('input publication: incomplete staging expires without publishing a native plan or retry',async t=>{
  const f=fixture(t,{deadlineUtc:new Date(Date.now()+80).toISOString()}),control=startDInputCoordinator(f.context);
  t.after(()=>control.stop());fs.writeFileSync(f.at(`INPUT_TERMINAL.${f.nonce}.safe.json.publishing`),'partial');
  const result=await control.done;assert.equal(result.reason,'WINDOW_EXPIRED');
  assert.equal(fs.existsSync(f.at(`D.plan.native-input.${f.nonce}.private.json`)),false);
  assert.equal(control.state().planPublications,0);
  assert.throws(()=>startDInputCoordinator({...f.context,deadlineUtc:new Date(Date.now()+1000).toISOString()}));
});

test('input publication: accepted admission hands off to the original D window, not the context cutoff',async t=>{
  const f=fixture(t,{deadlineUtc:new Date(Date.now()+150).toISOString()});
  f.parameters.deadlineUtc=new Date(Date.now()+120).toISOString();
  const control=startDInputCoordinator(f.context);t.after(()=>control.stop());admit(f);
  await waitFor(()=>control.state().planPublications===1);
  publishDInputRecord(f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`),f.terminal);
  const admittedUtc=new Date().toISOString();
  publishDInputAdmission({...f.context,admittedUtc,deadlineUtc:new Date(Date.parse(admittedUtc)+10800000).toISOString(),
    entryDeadlineUtc:f.context.deadlineUtc,businessStopUtc:new Date(Date.parse(admittedUtc)+8100000).toISOString()});
  await pause(180);assert.equal(control.state().status,'ADMITTED_WAITING_NATIVE_EXIT');
  publishDInputRecord(f.at(`WORKSPACE_NATIVE_EXIT.${f.nonce}.safe.json`),{
    kind:'ACTUAL_NATIVE_EXIT_NOT_CLEANUP_PASS',binding:f.binding,nonce:f.nonce,exitCode:0,supervisionUnknown:false});
  assert.equal((await control.done).status,'LOCAL_NATIVE_EXIT');
});

test('input publication: coordinator stop fences a received credential from late owner confirmation',async t=>{
  const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());
  const pipe='\\\\.\\pipe\\OGHR2HeadCredentials-'+f.nonce;
  const server=createServer(socket=>{socket.on('error',()=>{});socket.once('data',()=>socket.end(JSON.stringify({
    schemaVersion:1,binding:f.binding,nonce:f.nonce,accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)})));});
  await new Promise(resolve=>server.listen(pipe,resolve));
  try {
    await assert.rejects(receiveDConfirmedHeadCredentials({directory:f.directory,runId:f.runId,bindingSha256:f.binding,
      tokenLabel:f.context.tokenLabel,input:{nonce:f.nonce,deadlineUtc:f.parameters.deadlineUtc},
      supplierConfirmation:{path:f.at(`supplier-confirmation.${f.nonce}.safe.json`),deadlineUtc:f.context.deadlineUtc},
      assertAdmissionActive:()=>assertDInputAdmissionActive(f.context),
      onReceived:r=>{control.stop();publishDInputRecord(r.confirmationPath,{lateConfirmationMustNotBeUsed:true});}}),
      /D_INPUT_COORDINATOR_STOPPED/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('input publication: coordinator stop aborts the waiting pipe and releases it before any input',async t=>{
  const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());
  const server=createServer(socket=>{socket.on('error',()=>{});socket.once('data',()=>control.stop());});
  await new Promise(resolve=>server.listen('\\\\.\\pipe\\OGHR2HeadCredentials-'+f.nonce,resolve));
  try {
    await assert.rejects(receiveDConfirmedHeadCredentials({directory:f.directory,runId:f.runId,bindingSha256:f.binding,
      tokenLabel:f.context.tokenLabel,input:{nonce:f.nonce,deadlineUtc:f.parameters.deadlineUtc},
      supplierConfirmation:{path:f.at(`supplier-confirmation.${f.nonce}.safe.json`),deadlineUtc:f.context.deadlineUtc},
      assertAdmissionActive:()=>assertDInputAdmissionActive(f.context)}),/D_INPUT_COORDINATOR_STOPPED/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('input publication: STOP wins the atomic final-boundary race, never both STOP and ADMIT',async t=>{
  const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());admit(f);
  await waitFor(()=>control.state().planPublications===1);
  publishDInputRecord(f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`),f.terminal);
  const decision=f.at(`INPUT_DECISION.${f.nonce}.safe.json`),link=fs.linkSync;
  let interleaved=false;
  fs.linkSync=(source,target)=>{
    if(target===decision&&!interleaved&&JSON.parse(fs.readFileSync(source)).decision==='ADMIT'){
      interleaved=true;control.stop();
    }
    return link(source,target);
  };
  try {
    const admittedUtc=new Date().toISOString();
    assert.throws(()=>publishDInputAdmission({...f.context,admittedUtc,entryDeadlineUtc:f.context.deadlineUtc,
      deadlineUtc:new Date(Date.parse(admittedUtc)+10800000).toISOString(),
      businessStopUtc:new Date(Date.parse(admittedUtc)+8100000).toISOString()}),/D_INPUT_COORDINATOR_STOPPED/);
  }finally{fs.linkSync=link;}
  assert.equal(interleaved,true);assert.equal(JSON.parse(fs.readFileSync(decision)).decision,'STOP');
  assert.equal((await control.done).status,'STOPPED');
});

test('input publication: ADMIT wins before observer stop and later STOP cannot cancel D cleanup',async t=>{
  const f=fixture(t),control=startDInputCoordinator(f.context);t.after(()=>control.stop());admit(f);
  await waitFor(()=>control.state().planPublications===1);
  publishDInputRecord(f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`),f.terminal);
  const admittedUtc=new Date().toISOString();
  publishDInputAdmission({...f.context,admittedUtc,entryDeadlineUtc:f.context.deadlineUtc,
    deadlineUtc:new Date(Date.parse(admittedUtc)+10800000).toISOString(),
    businessStopUtc:new Date(Date.parse(admittedUtc)+8100000).toISOString()});
  control.stop();
  assert.equal((await control.done).status,'ADMITTED_OBSERVER_STOPPED_NOT_D_PASS');
  assert.equal(JSON.parse(fs.readFileSync(f.at(`INPUT_DECISION.${f.nonce}.safe.json`))).decision,'ADMIT');
  assert.equal(fs.existsSync(f.at(`COORDINATOR_FAILURE.${f.nonce}.safe.json`)),false);
});

test('input publication: append-only publisher cannot overwrite and preserves failed staging',t=>{
  const f=fixture(t),file=f.at('terminal.safe.json');publishDInputRecord(file,{original:true});
  assert.throws(()=>publishDInputRecord(file,{replacement:true}));
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),{original:true});
  assert.equal(fs.existsSync(file+'.publishing'),true);
});

test('input publication: actual PowerShell publisher emits no partial final and a distinct failure record',
  {skip:process.platform!=='win32'},t=>{
    const f=fixture(t),file=f.at('ps-terminal.safe.json');
    const pwsh='C:/Users/1/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
    const q=s=>"'"+s.replaceAll("'","''")+"'";
    const module=path.resolve('scripts/qa/d-local-input-receipt.ps1');
    const code=`. ${q(module)};Seal-LocalRecord ${q(file)} @{kind='SYNTHETIC_ONLY'};`+
      `try{Seal-LocalRecord ${q(file)} @{replacement=$true};exit 2}catch{'SAFE_EXPECTED_NO_REPLACE'}`;
    const out=execFileSync(pwsh,['-NoProfile','-NonInteractive','-OutputFormat','Text','-Command',code],
      {windowsHide:true,encoding:'utf8',timeout:10000});
    assert.equal(out.trim(),'SAFE_EXPECTED_NO_REPLACE');
    assert.equal(JSON.parse(fs.readFileSync(file)).kind,'SYNTHETIC_ONLY');
    assert.equal(JSON.parse(fs.readFileSync(file+'.failure.safe.json')).status,'STOPPED');
  });

for(const stopBeforeConfirmation of [false,true])test(
  `native local chain: actual child ${stopBeforeConfirmation?'STOP and reap':'ADMIT and exit'} with revocation duty`,
  {skip:process.platform!=='win32',timeout:30000},async t=>{
    const root=path.join(process.env.LOCALAPPDATA,'OpenGlassHub');
    const f=fixture(t,{deadlineUtc:new Date(Date.now()+25000).toISOString()},root);
    f.parameters.deadlineUtc=new Date(Date.now()+20000).toISOString();
    const pwsh='C:/Users/1/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
    const q=s=>"'"+s.replaceAll("'","''")+"'";
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','LOCALAPPDATA','USERPROFILE']
      .filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
    execFileSync(pwsh,['-NoProfile','-NonInteractive','-Command',
      `$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);`+
      `$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;`+
      `foreach($s in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){`+
      `$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};`+
      `Set-Acl -LiteralPath ${q(f.directory)} -AclObject $a`],{env,windowsHide:true,timeout:10000});
    const fake={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)};
    const publisher=path.resolve('scripts/qa/d-local-input-receipt.ps1'),capture=path.resolve('scripts/qa/capture-d-r2-head-credentials.ps1');
    const ps=`. ${q(publisher)};$global:fixtureIndex=0;
      function global:Read-Host {param([string]$Prompt,[switch]$AsSecureString)
        $labels=@('S3 Access Key ID','S3 Secret Access Key');
        if(-not $AsSecureString -or $global:fixtureIndex -ge 2 -or $Prompt -cne $labels[$global:fixtureIndex]){throw 'FIXTURE_PROMPT'};
        Write-Host ('FIXTURE_PROMPT:'+ $Prompt);
        $values=@(${q(fake.accessKeyId)},${q(fake.secretAccessKey)});
        $v=$values[$global:fixtureIndex];$global:fixtureIndex++;
        ConvertTo-SecureString -String $v -AsPlainText -Force
      }
      & ${q(capture)} -Nonce ${q(f.nonce)} -Binding ${q(f.binding)} -WindowEndUTC ${q(f.parameters.deadlineUtc)} -StatusDirectory ${q(f.directory)};
      if($LASTEXITCODE){exit $LASTEXITCODE};
      Seal-LocalRecord ${q(f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`))} (${q(JSON.stringify(f.terminal))}|ConvertFrom-Json);`;
    const control=startDInputCoordinator(f.context);t.after(()=>control.stop());
    const children=[],streams=[];
    const launch=(file,args)=>{
      const child=spawn(file,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
      const output={stdout:'',stderr:''};streams.push(output);
      child.stdout.on('data',b=>output.stdout+=b);child.stderr.on('data',b=>output.stderr+=b);
      return {child,output,exit:new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);})};
    };
    const wait=async predicate=>{const until=Date.now()+12000;while(!predicate()){
      if(Date.now()>until)throw Error('LOCAL_NATIVE_FIXTURE_TIMEOUT');await pause(10);}};
    try {
      publishDInputRecord(f.at(`HEAD_INPUT.${f.nonce}.parameters.safe.json`),f.parameters);
      const producer=launch(pwsh,['-NoProfile','-NonInteractive','-OutputFormat','Text',
        '-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')]);
      const nativePlan=f.at(`D.plan.native-input.${f.nonce}.private.json`);
      await wait(()=>fs.existsSync(nativePlan));
      const nativeSource=`import fs from 'node:fs';import path from 'node:path';
        import {receiveDConfirmedHeadCredentials,sealDRevocationDutyBeforeInput,verifyDPrivateInputHost} from './scripts/qa/d-execution-runtime.mjs';
        import {assertDInputAdmissionActive,publishDInputRecord,publishDInputAdmission} from './scripts/qa/d-input-coordination.mjs';
        const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
        const b={directory:p.directory,nonce:p.credentialInput.nonce,binding:p.sourceAdoption.sha256,runId:p.runId,
          deadlineUtc:p.inputCoordination.deadlineUtc};let result;
        try {
          sealDRevocationDutyBeforeInput(p);verifyDPrivateInputHost(p.credentialInput.expectedPid);
          result=await receiveDConfirmedHeadCredentials({directory:p.directory,runId:p.runId,bindingSha256:b.binding,
            tokenLabel:p.tokenLabel,input:p.credentialInput,supplierConfirmation:p.supplierConfirmation,
            assertAdmissionActive:()=>assertDInputAdmissionActive(b),
            onReceived:r=>publishDInputRecord(path.join(p.directory,'NATIVE_FIXTURE_RECEIVED.safe.json'),r)});
          while(!assertDInputAdmissionActive(b))await new Promise(r=>setTimeout(r,5));
          const admittedUtc=new Date().toISOString();
          publishDInputAdmission({...b,entryDeadlineUtc:b.deadlineUtc,admittedUtc,
            deadlineUtc:new Date(Date.parse(admittedUtc)+10800000).toISOString(),
            businessStopUtc:new Date(Date.parse(admittedUtc)+8100000).toISOString()});
          process.stdout.write('SYNTHETIC_NATIVE_ADMITTED_NO_PROVIDER_CALLS');
        }catch(e){process.stdout.write(e.message==='D_INPUT_COORDINATOR_STOPPED'?'SYNTHETIC_NATIVE_STOPPED':'SYNTHETIC_NATIVE_UNCLASSIFIED');
          process.exitCode=e.message==='D_INPUT_COORDINATOR_STOPPED'?75:1;
        }finally{for(const key of Object.keys(result?.credentials??{}))result.credentials[key]='';}`;
      const native=launch(process.execPath,['--input-type=module','-e',nativeSource,nativePlan]);
      const receivedFile=f.at('NATIVE_FIXTURE_RECEIVED.safe.json');await wait(()=>fs.existsSync(receivedFile));
      const received=JSON.parse(fs.readFileSync(receivedFile));
      const duty=JSON.parse(fs.readFileSync(f.at(`TOKEN_REVOCATION_DUTY.before-input.${f.binding}.safe.json`)));
      assert.equal(duty.status,'REQUIRES_OWNER_OFFICIAL_REVOCATION_ON_STOP');assert.equal(duty.notObjectCleanup,true);
      if(stopBeforeConfirmation)control.stop();
      else {
        const supplier=f.ref(f.at(`supplier-evidence.${f.nonce}.safe.json`),{account:'dcb374166b39234a499985145c075f50',
          bucket:'openglasshub-media',tokenLabel:f.context.tokenLabel,permission:'object-read-only',ttlHours:24,
          createdAfterVisiblePrompt:true,issuedUtc:received.receivedUtc,
          expiresUtc:new Date(Date.parse(received.receivedUtc)+86400000).toISOString()});
        publishDInputRecord(received.confirmationPath,{schemaVersion:1,runId:f.runId,nonce:f.nonce,
          sourceAdoptionSha256:f.binding,tokenLabel:f.context.tokenLabel,provenance:'OWNER_OFFICIAL_DASHBOARD',
          ownerConfirmed:true,confirmedUtc:new Date().toISOString(),supplierEvidence:supplier});
      }
      assert.equal(await producer.exit,0);assert.equal(await native.exit,stopBeforeConfirmation?75:0);
      assert.equal(native.child.exitCode,stopBeforeConfirmation?75:0);
      assert.equal(producer.output.stdout.indexOf('LOCAL_BOUND_NATIVE_RECEIVER_CONNECTED_NO_PRODUCTION_REQUEST')
        <producer.output.stdout.indexOf('FIXTURE_PROMPT:S3 Access Key ID'),true);
      assert.equal((producer.output.stdout.match(/FIXTURE_PROMPT:/g)??[]).length,2);
      publishDInputRecord(f.at(`WORKSPACE_NATIVE_EXIT.${f.nonce}.safe.json`),{kind:'ACTUAL_NATIVE_EXIT_NOT_CLEANUP_PASS',
        binding:f.binding,nonce:f.nonce,pid:native.child.pid,exitCode:native.child.exitCode,supervisionUnknown:false,
        provenance:'SYNTHETIC_REAL_CHILD_EXIT_NOT_PRODUCTION'});
      assert.equal((await control.done).status,stopBeforeConfirmation?'STOPPED':'LOCAL_NATIVE_EXIT');
      const stored=fs.readdirSync(f.directory).map(name=>fs.readFileSync(f.at(name),'utf8')).join('');
      for(const value of Object.values(fake))assert.equal((stored+JSON.stringify(streams)).includes(value),false);
      assert.equal(streams.every(s=>s.stderr===''),true);
    }finally{
      for(const child of children)if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}
    }
  });

test('input publication: actual coordinator + PowerShell producer + receiver + confirmation + terminal + simulated native exit',
  {skip:process.platform!=='win32',timeout:30000},async t=>{
    const root=path.join(process.env.LOCALAPPDATA,'OpenGlassHub');
    const f=fixture(t,{deadlineUtc:new Date(Date.now()+20000).toISOString()},root);
    f.parameters.deadlineUtc=new Date(Date.now()+15000).toISOString();
    const pwsh='C:/Users/1/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
    const q=s=>"'"+s.replaceAll("'","''")+"'";
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','LOCALAPPDATA','USERPROFILE']
      .filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
    execFileSync(pwsh,['-NoProfile','-NonInteractive','-Command',
      `$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);`+
      `$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;`+
      `foreach($s in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){`+
      `$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};`+
      `Set-Acl -LiteralPath ${q(f.directory)} -AclObject $a`],{env,windowsHide:true,timeout:10000});
    const fake={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)};
    const publisher=path.resolve('scripts/qa/d-local-input-receipt.ps1');
    const capture=path.resolve('scripts/qa/capture-d-r2-head-credentials.ps1');
    const script=`. ${q(publisher)};$global:fixtureIndex=0;
      function global:Read-Host {
        param([string]$Prompt,[switch]$AsSecureString)
        $labels=@('S3 Access Key ID','S3 Secret Access Key');
        if(-not $AsSecureString -or $global:fixtureIndex -ge 2 -or $Prompt -cne $labels[$global:fixtureIndex]){throw 'FIXTURE_PROMPT'};
        $values=@(${q(fake.accessKeyId)},${q(fake.secretAccessKey)});
        $value=$values[$global:fixtureIndex];$global:fixtureIndex++;
        ConvertTo-SecureString -String $value -AsPlainText -Force
      }
      & ${q(capture)} -Nonce ${q(f.nonce)} -Binding ${q(f.binding)} -WindowEndUTC ${q(f.parameters.deadlineUtc)} -StatusDirectory ${q(f.directory)};
      if($LASTEXITCODE){exit $LASTEXITCODE};if($global:fixtureIndex -ne 2){exit 2};
      $terminal=${q(JSON.stringify(f.terminal))}|ConvertFrom-Json;
      Seal-LocalRecord ${q(f.at(`INPUT_TERMINAL.${f.nonce}.safe.json`))} $terminal;`;
    const control=startDInputCoordinator(f.context);t.after(()=>control.stop());
    let child,received;
    try {
      publishDInputRecord(f.at(`HEAD_INPUT.${f.nonce}.parameters.safe.json`),f.parameters);
      child=spawn(pwsh,['-NoProfile','-NonInteractive','-OutputFormat','Text','-EncodedCommand',
        Buffer.from(script,'utf16le').toString('base64')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
      const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
      const native=f.at(`D.plan.native-input.${f.nonce}.private.json`);
      await waitFor(()=>fs.existsSync(native));
      const plan=JSON.parse(fs.readFileSync(native));assert.equal(plan.credentialInput.expectedPid,child.pid);
      received=await receiveDConfirmedHeadCredentials({directory:f.directory,runId:f.runId,bindingSha256:f.binding,
        tokenLabel:f.context.tokenLabel,input:plan.credentialInput,supplierConfirmation:plan.supplierConfirmation,
        onReceived:r=>{
          const supplier=f.ref(f.at(`supplier-evidence.${f.nonce}.safe.json`),{account:plan.account,bucket:plan.bucket,
            tokenLabel:plan.tokenLabel,permission:'object-read-only',ttlHours:24,createdAfterVisiblePrompt:true,
            issuedUtc:r.receivedUtc,expiresUtc:new Date(Date.parse(r.receivedUtc)+86400000).toISOString()});
          publishDInputRecord(r.confirmationPath,{schemaVersion:1,runId:f.runId,nonce:f.nonce,
            sourceAdoptionSha256:f.binding,tokenLabel:plan.tokenLabel,provenance:'OWNER_OFFICIAL_DASHBOARD',
            ownerConfirmed:true,confirmedUtc:new Date().toISOString(),supplierEvidence:supplier});
        }});
      assert.deepEqual(received.credentials,fake);assert.equal(await exited,0);assert.equal(stderr,'');
      await waitFor(()=>control.state().status==='WAITING_SUPPLIER_OR_NATIVE_EXIT');
      publishDInputRecord(f.at(`WORKSPACE_NATIVE_EXIT.${f.nonce}.safe.json`),{kind:'ACTUAL_NATIVE_EXIT_NOT_CLEANUP_PASS',
        binding:f.binding,nonce:f.nonce,exitCode:0,supervisionUnknown:false});
      const result=await control.done;
      assert.equal(result.status,'LOCAL_NATIVE_EXIT');assert.equal(result.productionPass,false);
      assert.equal(result.planPublications,1);assert.equal(result.providerRequests,0);
      const stored=fs.readdirSync(f.directory).map(name=>fs.readFileSync(f.at(name),'utf8')).join('');
      for(const value of Object.values(fake))assert.equal((stored+stdout+stderr).includes(value),false);
      assert.equal(fs.readdirSync(f.directory).some(name=>/^d-receipt-/.test(name)),false);
    }finally{
      for(const key of Object.keys(received?.credentials??{}))received.credentials[key]='';
      if(child?.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
    }
  });
