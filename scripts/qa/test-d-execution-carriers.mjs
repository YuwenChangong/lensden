import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDManualExecutionCarrier,createDMcpExecutionBridge,registerDToolPeer} from './d-execution-carriers.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const sourcePath=fileURLToPath(new URL('./d-production-bindings.mjs',import.meta.url));
const binding={executionBindingSha256:'a'.repeat(64),sourceSha256:hash(fs.readFileSync(sourcePath)),
  connectionBindingSha256:'b'.repeat(64),nonce:'synthetic-carriers-0001'};
const account='dcb374166b39234a499985145c075f50';
const code='async () => { return {state:"SYNTHETIC"}; }';
const wait=()=>new Promise(resolve=>setTimeout(resolve,5));
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-carriers-'));
  t.after(()=>{
    const target=path.resolve(root);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));
    assert.match(path.basename(target),/^ogh-d-carriers-/);fs.rmSync(target,{recursive:true,force:true});
  });
  const directory=path.join(root,'outbox'),downloadsDirectory=path.join(root,'downloads');
  fs.mkdirSync(directory,{mode:0o700});fs.mkdirSync(downloadsDirectory,{mode:0o700});
  return {root,directory,downloadsDirectory,binding,sourcePath,mode:'SYNTHETIC',pollIntervalMs:5};
}
const deadline=()=>new Date(Date.now()+2000).toISOString();
const request=(requestId='owner-delete')=>({code,requestId,deadlineUtc:deadline(),
  validate:r=>r.binding===binding.executionBindingSha256&&r.requestId===requestId&&r.acknowledged===true});
const output=id=>({binding:binding.executionBindingSha256,requestId:id,acknowledged:true});
function deletion(id){
  const rawDecodedResponse=JSON.stringify({status:200,success:true,result:[{key:'tmp/fixture/source.mp4'}],errors:[]});
  return {rawDecodedResponse,evidence:{executionBindingSha256:binding.executionBindingSha256,
    connectionBindingSha256:binding.connectionBindingSha256,account,bucket:'openglasshub-media',jurisdiction:'default',
    method:'DELETE',requestId:id,keys:['tmp/fixture/source.mp4'],createdKeys:['tmp/fixture/source.mp4'],
    responseSha256:hash(rawDecodedResponse),creationReceiptSha256:'c'.repeat(64),status:200,complete:true}};
}
async function take(bridge){for(let i=0;i<100;i++){const pending=bridge.takePending();if(pending)return pending;await wait();}throw Error('NO_SYNTHETIC_PENDING');}

test('manual: exact file is imported only after immutable code/manifest and delivery',async t=>{
  const s=setup(t);let ready;
  const carrier=createDManualExecutionCarrier({...s,onReady:info=>{ready=info;
    assert.equal(hash(fs.readFileSync(info.codePath)),info.codeSha256);
    assert.equal(JSON.parse(fs.readFileSync(info.manifestPath)).nonce,binding.nonce);
    fs.writeFileSync(path.join(s.downloadsDirectory,info.resultName),JSON.stringify(output(info.requestId)));
  }});
  assert.equal(carrier.ready().ready,true);
  const result=await carrier.run(request());assert.equal(result.acknowledged,true);
  assert.equal(ready.resultName,'ogh-owner-delete.json');
  assert.equal((await carrier.run(request())).state,'UNKNOWN');
  const reconstructed=createDManualExecutionCarrier({...s,onReady:()=>assert.fail('replayed delivery')});
  assert.equal((await reconstructed.run(request())).state,'UNKNOWN');
});

test('manual: stale exact file or wrong correlation never triggers a usable handoff',async t=>{
  const s=setup(t);fs.writeFileSync(path.join(s.downloadsDirectory,'ogh-stale.json'),JSON.stringify(output('stale')));
  let deliveries=0;
  const c=createDManualExecutionCarrier({...s,onReady:info=>{deliveries++;
    fs.writeFileSync(path.join(s.downloadsDirectory,info.resultName),JSON.stringify(output('foreign')));
  }});
  assert.equal((await c.run(request('stale'))).state,'UNKNOWN');assert.equal(deliveries,0);
  assert.equal((await c.run(request('wrong'))).state,'UNKNOWN');assert.equal(deliveries,1);
});

test('manual: expiry, cancellation and late download cannot resume a consumed request',async t=>{
  const s=setup(t);let info;
  const c=createDManualExecutionCarrier({...s,onReady:x=>{info=x;}});
  const p=request('late');p.deadlineUtc=new Date(Date.now()+35).toISOString();
  assert.equal((await c.run(p)).state,'UNKNOWN');
  fs.writeFileSync(path.join(s.downloadsDirectory,info.resultName),JSON.stringify(output('late')));
  assert.equal((await c.run({...p,deadlineUtc:deadline()})).state,'UNKNOWN');
  const abort=new AbortController();abort.abort();
  assert.equal((await c.run({...request('aborted'),signal:abort.signal})).state,'UNKNOWN');
});

test('manual: size, secret-shaped fields, symlinks and source drift fail closed',async t=>{
  const s=setup(t);
  const c=createDManualExecutionCarrier({...s,onReady:info=>{
    const value=info.requestId==='large'?' '.repeat(65537):JSON.stringify({...output(info.requestId),access_token:'SYNTHETIC_MUST_NOT_IMPORT'});
    fs.writeFileSync(path.join(s.downloadsDirectory,info.resultName),value);
  }});
  for(const id of ['large','sensitive'])assert.equal((await c.run(request(id))).state,'UNKNOWN');
  assert.throws(()=>createDManualExecutionCarrier({...s,binding:{...binding,sourceSha256:'d'.repeat(64)}}),/D_CARRIER_CONFIGURATION_INVALID/);
  const outside=path.join(s.root,'outside.json');fs.writeFileSync(outside,JSON.stringify(output('link')));
  let linked=false;
  try{fs.symlinkSync(outside,path.join(s.downloadsDirectory,'ogh-link.json'));linked=true;}catch(error){if(!['EPERM','EACCES'].includes(error.code))throw error;}
  if(linked)assert.equal((await c.run(request('link'))).state,'UNKNOWN');
  assert.equal(fs.readFileSync(outside,'utf8'),JSON.stringify(output('link')));
});

test('manual: explicit observer filename requires caller validation; unsafe paths and async validators reject',async t=>{
  const s=setup(t);const c=createDManualExecutionCarrier({...s,onReady:info=>{
    fs.writeFileSync(path.join(s.downloadsDirectory,info.resultName),JSON.stringify({binding:binding.executionBindingSha256,state:'OBSERVED'}));
  }});
  const r=await c.run({...request('observer'),resultName:'ogh-d-creation-fixture.json',validate:r=>r.state==='OBSERVED'});
  assert.equal(r.state,'OBSERVED');
  assert.equal((await c.run({...request('escape'),resultName:'../escape.json'})).state,'UNKNOWN');
  assert.equal((await c.run({...request('async'),resultName:'ogh-async.json',validate:async()=>true})).state,'UNKNOWN');
});

test('production: ready requires explicit trusted ACL gate; injected delivery/invoke are synthetic-only',t=>{
  const s=setup(t);
  assert.throws(()=>createDManualExecutionCarrier({...s,mode:'PRODUCTION'}),/D_CARRIER_CONFIGURATION_INVALID/);
  assert.throws(()=>createDManualExecutionCarrier({...s,mode:'PRODUCTION',verifyPrivateDirectory:()=>true,deliver:()=>{}}),/D_CARRIER_CONFIGURATION_INVALID/);
  assert.throws(()=>createDMcpExecutionBridge({...s,mode:'PRODUCTION',verifyPrivateDirectory:()=>true,invoke:()=>{},plan:()=>({})}),/D_CARRIER_CONFIGURATION_INVALID/);
  const c=createDManualExecutionCarrier({...s,mode:'PRODUCTION',verifyPrivateDirectory:()=>false});
  assert.equal(c.ready().ready,false);
});

test('bridge: separate process-shaped instances correlate full result and durable one-time dispatch',async t=>{
  const s=setup(t),meta={requestId:'source-delete',deadlineUtc:deadline(),codeSha256:hash(code)};
  const child=createDMcpExecutionBridge({...s,plan:()=>meta});
  const trusted=createDMcpExecutionBridge({...s});
  const pending=child.execute(code,{account_id:account});const ticket=await take(trusted);
  assert.equal(ticket.code,code);assert.equal(ticket.codeSha256,hash(code));
  assert.equal(trusted.canDispatch(ticket),true);
  assert.equal(trusted.takePending(),null);
  const toolResult={content:[{type:'text',text:JSON.stringify(deletion(meta.requestId))}]};
  assert.equal(trusted.acceptResult({ticket,toolResult}).accepted,true);
  assert.equal(trusted.canDispatch(ticket),false);
  const result=await pending;assert.deepEqual(result,deletion(meta.requestId));
  assert.equal(trusted.acceptResult({ticket,toolResult}).accepted,false);
  const capture=fs.readdirSync(s.directory).find(f=>f.endsWith('.tool-result.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.directory,capture))).toolResult,toolResult);
  assert.equal((await child.execute(code,{account_id:account})).state,'UNKNOWN');
});

test('bridge: expired queued work cannot be taken; taken work cannot be retried or accepted late',async t=>{
  const s=setup(t);let time=Date.now();
  const meta={requestId:'expired',deadlineUtc:new Date(time+50).toISOString(),codeSha256:hash(code)};
  const b=createDMcpExecutionBridge({...s,now:()=>time,plan:()=>meta});
  const p=b.execute(code,{account_id:account});time+=51;
  assert.equal(b.takePending(),null);assert.equal((await p).state,'UNKNOWN');
  const s2=setup(t);time=Date.now();meta.requestId='taken';meta.deadlineUtc=new Date(time+50).toISOString();
  const b2=createDMcpExecutionBridge({...s2,now:()=>time,plan:()=>meta});
  const p2=b2.execute(code,{account_id:account});const ticket=await take(b2);time+=51;
  assert.equal(b2.acceptResult({ticket,toolResult:deletion('taken')}).accepted,false);
  assert.equal((await p2).state,'UNKNOWN');assert.equal(b2.takePending(),null);
  assert.equal(fs.readdirSync(s2.directory).some(f=>f.endsWith('.tool-result.json')),true);
  assert.equal(fs.readdirSync(s2.directory).some(f=>f.endsWith('.tool-accepted.json')),false);
});

test('bridge: foreign pins, tool errors, truncated or oversized results remain UNKNOWN',async t=>{
  for(const variant of ['foreign','tool-error','truncated','oversized','bad-hash','wrong-key']){
    const s=setup(t),meta={requestId:variant,deadlineUtc:deadline(),codeSha256:hash(code)};
    const b=createDMcpExecutionBridge({...s,plan:()=>meta});const p=b.execute(code,{account_id:account});
    const ticket=await take(b);let toolResult=deletion(variant),acceptedTicket=ticket;
    if(variant==='foreign')acceptedTicket={...ticket,nonce:'foreign'};
    if(variant==='tool-error')toolResult={isError:true,content:[{type:'text',text:'SYNTHETIC'}]};
    if(variant==='truncated')toolResult={content:[{type:'text',text:'--- TRUNCATED ---'}]};
    if(variant==='oversized')toolResult={content:[{type:'text',text:'x'.repeat(65537)}]};
    if(variant==='bad-hash')toolResult.evidence.responseSha256='0'.repeat(64);
    if(variant==='wrong-key')toolResult.evidence.keys=['tmp/different/source.mp4'];
    assert.equal(b.acceptResult({ticket:acceptedTicket,toolResult}).accepted,false);
    if(variant==='foreign')b.stop();
    assert.equal((await p).state,'UNKNOWN');assert.equal(b.takePending(),null);
    if(['tool-error','truncated','bad-hash','wrong-key'].includes(variant)){
      assert.equal(fs.readdirSync(s.directory).some(f=>f.endsWith('.tool-result.json')),true);
      assert.equal(fs.readdirSync(s.directory).some(f=>f.endsWith('.tool-accepted.json')),false);
    }
  }
});

test('bridge: fixed account, code pin and source pins checked before publishing',async t=>{
  const s=setup(t),b=createDMcpExecutionBridge({...s,plan:()=>({requestId:'scope',deadlineUtc:deadline(),codeSha256:'e'.repeat(64)})});
  assert.equal((await b.execute(code,{account_id:'wrong'})).state,'UNKNOWN');
  assert.equal((await b.execute(code,{account_id:account})).state,'UNKNOWN');
  assert.equal(fs.readdirSync(s.directory).some(f=>f.endsWith('.request.json')),false);
});

test('bridge: parent abort durably blocks a separate trusted dispatcher before tool invocation',async t=>{
  const s=setup(t),meta={requestId:'abort-before-dispatch',deadlineUtc:deadline(),codeSha256:hash(code)};
  const child=createDMcpExecutionBridge({...s,plan:()=>meta}),trusted=createDMcpExecutionBridge(s);
  const abort=new AbortController(),p=child.execute(code,{account_id:account},abort.signal);
  abort.abort();assert.equal(trusted.takePending(),null);assert.equal((await p).state,'UNKNOWN');
  assert.equal(fs.readdirSync(s.directory).some(f=>f.endsWith('.mcp.dispatch.json')),false);
});

test('bridge: nested sensitive fields never reach full-result capture and synthetic mode cannot feed production',async t=>{
  const s=setup(t),meta={requestId:'private-field',deadlineUtc:deadline(),codeSha256:hash(code)};
  const child=createDMcpExecutionBridge({...s,plan:()=>meta});const p=child.execute(code,{account_id:account});
  const production=createDMcpExecutionBridge({...s,mode:'PRODUCTION',verifyPrivateDirectory:()=>true});
  assert.equal(production.takePending(),null);
  const ticket=await take(child),result={...deletion(meta.requestId),access_token:'SYNTHETIC_MUST_NOT_PERSIST'};
  assert.equal(child.acceptResult({ticket,toolResult:{content:[{type:'text',text:JSON.stringify(result)}]}}).accepted,false);
  assert.equal((await p).state,'UNKNOWN');assert.equal(fs.readdirSync(s.directory).some(f=>f.endsWith('.tool-result.json')),false);
});

test('manual: synchronous validation crossing the deadline leaves only an unaccepted handoff',async t=>{
  const s=setup(t);let time=Date.now();const end=new Date(time+1000).toISOString();
  const c=createDManualExecutionCarrier({...s,now:()=>time,onReady:info=>{
    fs.writeFileSync(path.join(s.downloadsDirectory,info.resultName),JSON.stringify(output(info.requestId)));
  }});
  assert.equal((await c.run({...request('slow-validation'),deadlineUtc:end,validate:()=>{time+=1001;return true;}})).state,'UNKNOWN');
  assert.equal(fs.readdirSync(s.directory).some(f=>f.endsWith('.manual.result.json')),false);
});

test('manual: changed outbox provenance and downloaded source/nonce pins cannot be accepted',async t=>{
  for(const variant of ['code','manifest','nonce','source']){
    const s=setup(t),c=createDManualExecutionCarrier({...s,onReady:info=>{
      const result=output(info.requestId);
      if(variant==='code')fs.writeFileSync(info.codePath,'async () => null');
      if(variant==='manifest'){
        const manifest=JSON.parse(fs.readFileSync(info.manifestPath));manifest.nonce='foreign';
        fs.writeFileSync(info.manifestPath,JSON.stringify(manifest));
      }
      if(variant==='nonce')result.nonce='foreign';
      if(variant==='source')result.sourceSha256='d'.repeat(64);
      fs.writeFileSync(path.join(s.downloadsDirectory,info.resultName),JSON.stringify(result));
    }});
    assert.equal((await c.run(request(variant))).state,'UNKNOWN');
    assert.equal(fs.readdirSync(s.directory).some(f=>f.endsWith('.manual.result.json')),false);
  }
});

test('peer: exact trusted local registration gates readiness and expires after ten minutes without a provider probe',t=>{
  const s=setup(t);let time=Date.now();
  const bound={...binding,runId:'synthetic-run-01',authorizationSha256:'d'.repeat(64),sourceCommit:'e'.repeat(40)};
  const peer={runId:bound.runId,authorizationSha256:bound.authorizationSha256,sourceCommit:bound.sourceCommit,
    connectionBindingSha256:bound.connectionBindingSha256,toolName:'mcp__cloudflare__execute'};
  const b=createDMcpExecutionBridge({...s,binding:bound,requireToolPeer:true,now:()=>time});
  assert.equal(b.ready().ready,false);
  const registered=b.registerPeer(peer);assert.equal(registered.providerPermissionProven,false);
  assert.equal(b.ready().ready,true);assert.equal(b.ready().toolPeerRegistered,true);
  assert.equal(b.ready().providerPermissionProven,false);
  const foreign=createDMcpExecutionBridge({...s,binding:{...bound,authorizationSha256:'f'.repeat(64)},requireToolPeer:true,now:()=>time});
  assert.equal(foreign.ready().ready,false);
  assert.throws(()=>b.registerPeer({...peer,toolName:'unbound_tool'}),/REGISTRATION_INVALID/);
  time+=600001;assert.equal(b.ready().ready,false);
  registerDToolPeer(s.directory,peer,{mode:'SYNTHETIC',now:()=>time});assert.equal(b.ready().ready,true);
});

test('manual: production readiness needs canonical downloads plus a nonsecret prepared page descriptor',t=>{
  const s=setup(t),opts={...s,mode:'PRODUCTION',verifyPrivateDirectory:()=>true};
  const absent=createDManualExecutionCarrier(opts);assert.equal(absent.ready().ready,false);
  const good=createDManualExecutionCarrier({...opts,preparedContext:{origin:'https://openglasshub.ogh.workers.dev',
    pathname:'/admin/security/',ownerPrepared:true}});
  assert.equal(good.ready().ready,true);assert.equal(good.ready().browserSessionProven,false);
  const bad=createDManualExecutionCarrier({...opts,preparedContext:{origin:'https://openglasshub.ogh.workers.dev',
    pathname:'/admin/security/?token=must-not-accept',ownerPrepared:true}});
  assert.equal(bad.ready().ready,false);
  fs.renameSync(s.downloadsDirectory,s.downloadsDirectory+'.moved');assert.equal(good.ready().ready,false);
});
