import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {verifyDPrivateInputHost,dLoaderFailureDetails} from './d-execution-runtime.mjs';

const pwsh='C:/Users/1/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
const windows={skip:process.platform!=='win32',timeout:30000};

test('private host: real same-user pinned PowerShell accepts CIM backslashes against forward-slash pin',windows,async()=>{
  const child=spawn(pwsh,['-NoProfile','-NonInteractive','-Command',
    '[Console]::WriteLine("HOST_FIXTURE_READY"); Start-Sleep -Seconds 25'],
    {windowsHide:true,stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');
  try {
    const [data]=await once(child.stdout,'data');
    assert.equal(data.toString().trim(),'HOST_FIXTURE_READY');
    const result=execFileSync(pwsh,['-NoProfile','-NonInteractive','-CommandWithArgs',
      "$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$args[0]);[string]($p.ExecutablePath -ieq $args[1])",String(child.pid),pwsh],
      {encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
    assert.equal(result.trim(),'False');
    assert.doesNotThrow(()=>verifyDPrivateInputHost(child.pid));
  }finally{child.kill();await exited;}
});

test('private host: another executable under the same user is still rejected',windows,()=>{
  assert.throws(()=>verifyDPrivateInputHost(process.pid),/^Error: D_PRIVATE_HOST_UNPROVEN$/);
});

test('private host: absent process is rejected without exposing subprocess diagnostics',windows,()=>{
  assert.throws(()=>verifyDPrivateInputHost(2147483647),/^Error: D_PRIVATE_HOST_UNPROVEN$/);
});

test('private host: malformed PID never reaches a process lookup',()=>{
  for(const pid of [undefined,null,0,-1,1.5,'1',Infinity])
    assert.throws(()=>verifyDPrivateInputHost(pid),/^Error: D_PRIVATE_HOST_UNPROVEN$/);
});

test('loader stop: fixed stages and exact safe codes survive without exception text',()=>{
  for(const phase of ['PRIVATE_READY','PRIVATE_HOST','PRIVATE_RECEIVE','SUPPLIER_CONFIRMATION','FINAL_ADMISSION','PORTS_BINDING'])
    assert.deepEqual(dLoaderFailureDetails(phase,Error('D_PRIVATE_HOST_UNPROVEN')),
      {localPhase:phase,localReason:'D_PRIVATE_HOST_UNPROVEN'});
  const fictitious='FICTITIOUS_SECRET_NEVER_PERSIST';
  for(const error of [Error(fictitious),Error('D_PRIVATE_HOST_UNPROVEN '+fictitious),{code:fictitious},null]){
    const result=dLoaderFailureDetails(fictitious,error);
    assert.deepEqual(result,{localPhase:'UNKNOWN',localReason:'D_LOCAL_FAILURE_UNCLASSIFIED'});
    assert.equal(JSON.stringify(result).includes(fictitious),false);
  }
});
