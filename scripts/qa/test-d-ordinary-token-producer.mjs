import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {receiveDConfirmedHeadCredentials} from './d-execution-runtime.mjs';
import {dHash,sealDRecord} from './d-execution-journal.mjs';

const pwsh='C:/Users/1/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const fake={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)};

// Exercise the real non-OfflineFixture producer with a synthetic Read-Host only.
// No provider client, production plan, real credential or business window exists.
test('ordinary producer: actual PowerShell -> same-user ACK -> two fields -> confirmed receiver',
  {skip:process.platform!=='win32',timeout:30000},async()=>{
    const root=path.join(process.env.LOCALAPPDATA,'OpenGlassHub');
    const directory=fs.mkdtempSync(path.join(root,'d-ordinary-producer-synthetic-'));
    const nonce=randomUUID(),runId=randomUUID(),binding='7'.repeat(64),tokenLabel='FICTITIOUS_ONLY';
    const deadlineUtc=new Date(Date.now()+20000).toISOString();
    let child,result;
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','LOCALAPPDATA','USERPROFILE']
      .filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]));
    try {
      execFileSync(pwsh,['-NoProfile','-NonInteractive','-Command',
        `$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);`+
        `$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;`+
        `foreach($s in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){`+
        `$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};`+
        `Set-Acl -LiteralPath ${quote(directory)} -AclObject $a`],{env,windowsHide:true,timeout:10000});
      const producer=path.resolve('scripts/qa/capture-d-r2-head-credentials.ps1');
      const wrapper=`$global:fixtureIndex=0;
        function global:Read-Host {
          param([string]$Prompt,[switch]$AsSecureString)
          $labels=@('S3 Access Key ID','S3 Secret Access Key');
          if(-not $AsSecureString -or $global:fixtureIndex -ge 2 -or $Prompt -cne $labels[$global:fixtureIndex]){throw 'FIXTURE_UNEXPECTED_PROMPT'};
          Write-Host ('FIXTURE_PROMPT:'+ $Prompt);
          $values=@(${quote(fake.accessKeyId)},${quote(fake.secretAccessKey)});
          $value=$values[$global:fixtureIndex];$global:fixtureIndex++;
          ConvertTo-SecureString -String $value -AsPlainText -Force
        }
        & ${quote(producer)} -Nonce ${quote(nonce)} -Binding ${quote(binding)} -WindowEndUTC ${quote(deadlineUtc)} -StatusDirectory ${quote(directory)};
        if($LASTEXITCODE){exit $LASTEXITCODE};if($global:fixtureIndex -ne 2){exit 2}`;
      child=spawn(pwsh,['-NoProfile','-NonInteractive','-OutputFormat','Text','-EncodedCommand',Buffer.from(wrapper,'utf16le').toString('base64')],
        {env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
      const completed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
      const readyFile=path.join(directory,`head-input.${nonce}.ready.safe.json`);
      while(!fs.existsSync(readyFile)&&child.exitCode===null&&Date.now()<Date.parse(deadlineUtc))
        await new Promise(resolve=>setTimeout(resolve,25));
      const ready=JSON.parse(fs.readFileSync(readyFile,'utf8'));
      assert.equal(ready.pid,child.pid);assert.equal(ready.binding,binding);
      assert.equal(ready.status,'LOCAL_CURRENT_USER_PIPE_READY');
      assert.equal(stdout.includes('FIXTURE_PROMPT:'),false);
      let confirmations=0;
      result=await receiveDConfirmedHeadCredentials({directory,runId,bindingSha256:binding,tokenLabel,
        input:{nonce,deadlineUtc},supplierConfirmation:{path:path.join(directory,`supplier-confirmation.${nonce}.safe.json`),
          deadlineUtc:new Date(Date.parse(deadlineUtc)+1000).toISOString()},
        onReceived:r=>{
          confirmations++;
          const supplierPath=path.join(directory,`supplier-evidence.${nonce}.safe.json`);
          sealDRecord(supplierPath,{account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',
            tokenLabel,permission:'object-read-only',ttlHours:24,createdAfterVisiblePrompt:true,
            issuedUtc:r.receivedUtc,expiresUtc:new Date(Date.parse(r.receivedUtc)+86400000).toISOString()});
          sealDRecord(r.confirmationPath,{schemaVersion:1,runId,nonce,sourceAdoptionSha256:binding,tokenLabel,
            provenance:'OWNER_OFFICIAL_DASHBOARD',ownerConfirmed:true,confirmedUtc:new Date().toISOString(),
            supplierEvidence:{path:supplierPath,sha256:dHash(fs.readFileSync(supplierPath))}});
        }});
      assert.deepEqual(result.credentials,fake);assert.equal(confirmations,1);
      assert.equal(await completed,0);assert.equal(stderr,'');
      assert.equal(stdout.includes('Session Token'),false);
      assert.equal((stdout.match(/FIXTURE_PROMPT:/g)??[]).length,2);
      assert.match(stdout,/LOCAL_S3_CREDENTIAL_TRANSFER_COMPLETE_NO_PRODUCTION_REQUEST/);
      const stored=fs.readdirSync(directory).map(name=>fs.readFileSync(path.join(directory,name),'utf8')).join('');
      for(const value of Object.values(fake))assert.equal((stored+stdout+stderr).includes(value),false);
      assert.equal(ready.productionRequests,0);
      assert.equal(fs.readdirSync(directory).some(name=>name.startsWith('d-receipt-')),false);
    }finally{
      for(const key of Object.keys(result?.credentials??{}))result.credentials[key]='';
      if(child?.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
      assert.equal(path.dirname(directory),root);
      assert.match(path.basename(directory),/^d-ordinary-producer-synthetic-/);
      fs.rmSync(directory,{recursive:true});
    }
  });
