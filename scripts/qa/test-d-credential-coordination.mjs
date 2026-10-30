import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {randomUUID,createHash} from 'node:crypto';
import {receiveDConfirmedHeadCredentials,assertDSupplierDeadline} from './d-execution-runtime.mjs';

const binding='0'.repeat(64),fake={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)};
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const write=(file,value)=>{const raw=Buffer.from(JSON.stringify(value));fs.writeFileSync(file,raw,{flag:'wx'});return {path:file,sha256:hash(raw)};};

async function fixture(run,changeFrame=()=>{}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-input-coordination-'));
  const nonce=randomUUID(),runId=randomUUID(),tokenLabel='FICTITIOUS_NOT_A_REAL_TOKEN';
  const input={nonce,deadlineUtc:new Date(Date.now()+4000).toISOString()};
  const supplierConfirmation={path:path.join(directory,'supplier-confirmation.'+nonce+'.safe.json'),
    deadlineUtc:new Date(Date.now()+5000).toISOString()};
  const params={directory,input,supplierConfirmation,runId,bindingSha256:binding,tokenLabel,offlineFixture:true};
  let connections=0,ack='',serverError=null;
  const server=createServer(socket=>{
    connections++;socket.on('error',error=>{serverError=error.code;});
    socket.once('data',data=>{
      ack=data.toString('ascii');
      const frame={schemaVersion:1,binding,nonce,...fake};changeFrame(frame);
      socket.end(JSON.stringify(frame));
    });
  });
  const pipe=process.platform==='win32'?'\\\\.\\pipe\\OGHR2HeadCredentials-Fixture-'+nonce:path.join(directory,'input.sock');
  await new Promise(resolve=>server.listen(pipe,resolve));
  const publish=(received,change=()=>{},supplierChange=()=>{})=>{
    const supplier={account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',tokenLabel,
      permission:'object-read-only',ttlHours:24,createdAfterVisiblePrompt:true,
      issuedUtc:received.receivedUtc,expiresUtc:new Date(Date.parse(received.receivedUtc)+86400000).toISOString()};
    supplierChange(supplier);
    const supplierEvidence=write(path.join(directory,'supplier-evidence.'+nonce+'.safe.json'),supplier);
    const confirmation={schemaVersion:1,runId,nonce,sourceAdoptionSha256:binding,tokenLabel,
      ownerConfirmed:true,provenance:'OWNER_OFFICIAL_DASHBOARD',confirmedUtc:new Date().toISOString(),supplierEvidence};
    change(confirmation);write(supplierConfirmation.path,confirmation);
  };
  try{await run({params,publish,directory,connections:()=>connections,ack:()=>ack,serverError:()=>serverError});}
  finally{
    await new Promise(resolve=>server.close(resolve));
    assert.equal(path.dirname(directory),os.tmpdir());
    assert.match(path.basename(directory),/^ogh-input-coordination-/);
    fs.rmSync(directory,{recursive:true});
  }
}

test('coordination: connected receiver accepts input before later non-secret owner confirmation',async()=>{
  await fixture(async f=>{
    let received,settled=false;
    const pending=receiveDConfirmedHeadCredentials({...f.params,onReceived:r=>{received=r;}});
    pending.then(()=>{settled=true;},()=>{settled=true;});
    while(!received)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(f.connections(),1);
    assert.equal(f.ack(),`OGH_HEAD_RECEIVER_V1 ${binding} ${f.params.input.nonce}\n`);
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(settled,false);assert.equal(received.productionRequests,0);
    f.publish(received);
    const result=await pending;
    assert.deepEqual(result.credentials,fake);assert.equal(result.supplier.bucket,'openglasshub-media');
    const stored=fs.readdirSync(f.directory).filter(n=>n.endsWith('.json')).map(n=>fs.readFileSync(path.join(f.directory,n),'utf8')).join('');
    for(const v of Object.values(fake))assert.equal(stored.includes(v),false);
    for(const k of Object.keys(result.credentials))result.credentials[k]='';
    assert.equal(f.serverError(),null);
  });
});

test('coordination: confirmation may follow input deadline but cannot extend its own deadline',async()=>{
  await fixture(async f=>{
    f.params.input.deadlineUtc=new Date(Date.now()+500).toISOString();
    let received;
    const pending=receiveDConfirmedHeadCredentials({...f.params,onReceived:r=>{received=r;}});
    while(!received)await new Promise(resolve=>setTimeout(resolve,10));
    await new Promise(resolve=>setTimeout(resolve,550));
    f.publish(received);
    const result=await pending;assert.deepEqual(result.credentials,fake);
    for(const k of Object.keys(result.credentials))result.credentials[k]='';
  });
});

test('coordination: absent confirmation expires without retry or a production callback',async()=>{
  await fixture(async f=>{
    f.params.input.deadlineUtc=new Date(Date.now()+250).toISOString();
    f.params.supplierConfirmation.deadlineUtc=new Date(Date.now()+350).toISOString();
    await assert.rejects(receiveDConfirmedHeadCredentials(f.params),/D_SUPPLIER_CONFIRMATION_EXPIRED/);
    assert.equal(f.connections(),1);
  });
});

for(const [name,change] of [
  ['wrong nonce',r=>{r.nonce=randomUUID();}],
  ['wrong run',r=>{r.runId=randomUUID();}],
  ['wrong source adoption',r=>{r.sourceAdoptionSha256='1'.repeat(64);}],
  ['missing actual owner confirmation',r=>{r.ownerConfirmed=false;}],
  ['untrusted provenance',r=>{r.provenance='LOCAL_GUESS';}],
  ['confirmation predating input',r=>{r.confirmedUtc='2000-01-01T00:00:00.000Z';}],
  ['changed evidence hash',r=>{r.supplierEvidence.sha256='1'.repeat(64);}],
  ['evidence outside exact path',r=>{r.supplierEvidence.path=path.join(os.tmpdir(),'wrong-file.json');}]
])test('coordination fails closed: '+name,async()=>{
  await fixture(async f=>{
    await assert.rejects(receiveDConfirmedHeadCredentials({...f.params,onReceived:r=>f.publish(r,change)}));
    assert.equal(f.connections(),1);
  });
});

test('coordination: wrong bucket and insufficient supplier lifetime never admit execution',async()=>{
  for(const change of [r=>{r.bucket='other';},r=>{r.expiresUtc=r.issuedUtc;}])await fixture(async f=>{
    await assert.rejects(receiveDConfirmedHeadCredentials({...f.params,onReceived:r=>f.publish(r,()=>{},change)}),/D_SUPPLIER_LIFETIME_UNPROVEN/);
    assert.equal(f.connections(),1);
  });
});

test('coordination: prepublished confirmation or unbounded wait stops before pipe connection',async()=>{
  await fixture(async f=>{
    write(f.params.supplierConfirmation.path,{ownerConfirmed:true});
    await assert.rejects(receiveDConfirmedHeadCredentials(f.params),/D_SUPPLIER_HANDOFF_NOT_ADMITTED/);
    assert.equal(f.connections(),0);
  });
  await fixture(async f=>{
    f.params.supplierConfirmation.deadlineUtc=new Date(Date.now()+601000).toISOString();
    await assert.rejects(receiveDConfirmedHeadCredentials(f.params),/D_SUPPLIER_HANDOFF_NOT_ADMITTED/);
    assert.equal(f.connections(),0);
  });
});

test('coordination: supplier expiry covers the actual later D deadline, not just confirmation time',()=>{
  const expiry=new Date(Date.now()+10800000).toISOString(),supplier={expiresUtc:expiry};
  assert.doesNotThrow(()=>assertDSupplierDeadline(supplier,expiry));
  assert.throws(()=>assertDSupplierDeadline(supplier,new Date(Date.parse(expiry)+1).toISOString()),/D_SUPPLIER_LIFETIME_UNPROVEN/);
  assert.throws(()=>assertDSupplierDeadline({},expiry),/D_SUPPLIER_LIFETIME_UNPROVEN/);
});

test('coordination: nonempty ordinary-token third field stops before requesting owner confirmation',async()=>{
  await fixture(async f=>{
    let confirmations=0;
    await assert.rejects(receiveDConfirmedHeadCredentials({...f.params,onReceived:()=>{confirmations++;}}),/D_ORDINARY_TOKEN_THIRD_FIELD_FORBIDDEN/);
    assert.equal(confirmations,0);assert.equal(f.connections(),1);
  },frame=>{frame.sessionToken='FICTITIOUS_THIRD_FIELD';});
});

test('coordination: malformed published confirmation stops rather than waiting for replacement',async()=>{
  await fixture(async f=>{
    await assert.rejects(receiveDConfirmedHeadCredentials({...f.params,onReceived:()=>{
      fs.writeFileSync(f.params.supplierConfirmation.path,'{',{flag:'wx'});
    }}),SyntaxError);
    assert.equal(f.connections(),1);
  });
});
