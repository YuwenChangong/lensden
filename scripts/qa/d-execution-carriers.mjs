import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const account='dcb374166b39234a499985145c075f50';
const maximum=65536;
const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64);
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const utc=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const fail=()=>{throw Error('D_CARRIER_UNPROVEN');};
function synchronous(value){
  if(value&&typeof value.then==='function'){Promise.resolve(value).catch(()=>{});fail();}
  return value;
}
const unknown=requestId=>({state:'UNKNOWN',requestId:identifier(requestId)?requestId:null,
  reason:'D_HANDOFF_UNPROVEN_NO_RETRY',productionAuthority:false,providerCancellationProven:false});
const sensitive=/^(?:access_?token|refresh_?token|id_?token|session_?token|authorization|cookie|set-cookie|password|secret(?:AccessKey)?|accessKeyId|adminKey|serviceRoleKey|apikey)$/i;
function safe(value,depth=0){
  if(depth>32)fail();
  if(typeof value==='string'){
    if(/eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[a-zA-Z0-9_./+=-]{16,}/.test(value))fail();
    if(/^[\s]*[\[{]/.test(value)){
      let nested;try{nested=JSON.parse(value);}catch{}
      if(nested&&typeof nested==='object')safe(nested,depth+1);
    }
  }else if(value&&typeof value==='object'){
    if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)fail();
    for(const [key,item] of Object.entries(value)){if(sensitive.test(key))fail();safe(item,depth+1);}
  }else if(value!==undefined&&value!==null&&typeof value!=='boolean'&&(typeof value!=='number'||!Number.isFinite(value)))fail();
}
function directoryPath(value){
  if(typeof value!=='string'||!path.isAbsolute(value))fail();
  let current=path.resolve(value);
  for(;;){const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())fail();
    const parent=path.dirname(current);if(parent===current)break;current=parent;}
  return fs.realpathSync.native(path.resolve(value));
}
function exists(file){try{fs.lstatSync(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function read(file,limit=maximum){
  const prior=fs.lstatSync(file);if(!prior.isFile()||prior.isSymbolicLink()||prior.nlink!==1||prior.size>limit)fail();
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{
    const before=fs.fstatSync(fd);
    if(!before.isFile()||before.nlink!==1||before.ino!==prior.ino||before.dev!==prior.dev||before.size>limit)fail();
    const bytes=Buffer.alloc(limit+1);let size=0;
    for(;;){const count=fs.readSync(fd,bytes,size,bytes.length-size,null);size+=count;if(size>limit)fail();if(!count)break;}
    const after=fs.fstatSync(fd),named=fs.lstatSync(file);
    if(!named.isFile()||named.isSymbolicLink()||named.nlink!==1||named.ino!==before.ino||named.dev!==before.dev
      ||after.size!==size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs
      ||named.size!==after.size||named.mtimeMs!==after.mtimeMs)fail();
    return {bytes:bytes.subarray(0,size),stat:after};
  }finally{fs.closeSync(fd);}
}
function json(file){const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read(file).bytes));safe(parsed);return parsed;}
function seal(file,value){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)+'\n');
  if(bytes.length>maximum)fail();
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(!read(file).bytes.equals(bytes))fail();
}
function base(options){
  try{
    const {binding,sourcePath,mode='PRODUCTION',verifyPrivateDirectory,now=Date.now,pollIntervalMs=50}=options;
    const b=structuredClone(binding);
    if(!digest(b?.executionBindingSha256)||!digest(b.sourceSha256)||!identifier(b.nonce)
      ||b.connectionBindingSha256!==undefined&&!digest(b.connectionBindingSha256)
      ||b.runId!==undefined&&!identifier(b.runId)||b.authorizationSha256!==undefined&&!digest(b.authorizationSha256)
      ||b.sourceCommit!==undefined&&!/^[a-f0-9]{40}$/.test(b.sourceCommit)
      ||Object.keys(b).some(k=>!['executionBindingSha256','sourceSha256','connectionBindingSha256','nonce',
        'runId','authorizationSha256','sourceCommit'].includes(k))
      ||!['PRODUCTION','SYNTHETIC'].includes(mode)||typeof now!=='function'
      ||!Number.isInteger(pollIntervalMs)||pollIntervalMs<1||pollIntervalMs>1000
      ||mode==='PRODUCTION'&&(typeof verifyPrivateDirectory!=='function'||options.deliver!==undefined||options.invoke!==undefined)
      ||typeof sourcePath!=='string'||!path.isAbsolute(sourcePath))fail();
    const directory=directoryPath(options.directory),source=path.resolve(sourcePath);
    const pins=()=>{
      directoryPath(directory);directoryPath(path.dirname(source));
      if(hash(read(source,262144).bytes)!==b.sourceSha256)fail();
      if(mode==='PRODUCTION'&&synchronous(verifyPrivateDirectory(directory))!==true)fail();
    };
    if(hash(read(source,262144).bytes)!==b.sourceSha256)fail();
    const domain=hash(JSON.stringify({binding:b.executionBindingSha256,nonce:b.nonce,mode}));
    const prefix=id=>path.join(directory,domain+'.'+id);
    const check=(deadlineUtc,signal)=>{pins();const time=now();
      if(!Number.isFinite(time)||signal?.aborted||!utc(deadlineUtc)||time>=Date.parse(deadlineUtc))fail();return time;};
    const ready=()=>{try{pins();return {ready:true,mode,readiness:'LOCAL_CONFIGURATION_ONLY',productionAuthority:false};}
      catch{return {ready:false,mode,readiness:'LOCAL_CONFIGURATION_ONLY',productionAuthority:false};}};
    return {b:Object.freeze(b),directory,domain,prefix,pins,check,ready,mode,now,pollIntervalMs};
  }catch{throw Error('D_CARRIER_CONFIGURATION_INVALID');}
}
function pause(ms,signal){return new Promise(resolve=>{
  if(signal?.aborted){resolve();return;}
  const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};
  const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});
});}
const stamp=(ctx,id)=>({...ctx.b,mode:ctx.mode,requestId:id,productionAuthority:false});
function noteUnknown(ctx,id){try{if(identifier(id))seal(ctx.prefix(id)+'.unknown.json',{
  kind:'HANDOFF_UNKNOWN_NOT_PERMISSION',...stamp(ctx,id)});}catch{}}

function peerBinding(peer){
  if(!peer||Object.keys(peer).sort().join(',')!=='authorizationSha256,connectionBindingSha256,runId,sourceCommit,toolName'
    ||!identifier(peer.runId)||!digest(peer.authorizationSha256)||!digest(peer.connectionBindingSha256)
    ||!/^[a-f0-9]{40}$/.test(peer.sourceCommit)||peer.toolName!=='mcp__cloudflare__execute')fail();
  return {runId:peer.runId,authorizationSha256:peer.authorizationSha256,sourceCommit:peer.sourceCommit,
    connectionBindingSha256:peer.connectionBindingSha256,toolName:peer.toolName};
}
const peerPrefix=(peer,mode)=>'d-tool-peer-'+hash(JSON.stringify({peer,mode}))+'.';
// Trusted Codex calls this only after finding the exact tool in current available
// tool metadata and binding the take/canDispatch/tool-call/accept bridge below.
// No provider probe occurs. This record proves LOCAL peer registration only;
// DELETE permission still needs the parent's pinned grant/current evidence.
// Production options must include the same synchronous private ACL verifier.
export function registerDToolPeer(directory,peer,{mode='PRODUCTION',verifyPrivateDirectory,now=Date.now}={}){
  try{
    directory=directoryPath(directory);peer=peerBinding(peer);
    if(!['PRODUCTION','SYNTHETIC'].includes(mode)||typeof now!=='function'
      ||mode==='PRODUCTION'&&(typeof verifyPrivateDirectory!=='function'||synchronous(verifyPrivateDirectory(directory))!==true))fail();
    const time=now();if(!Number.isFinite(time))fail();
    const record={kind:'TRUSTED_CODEX_LOCAL_TOOL_PEER_NOT_PROVIDER_PERMISSION',mode,...peer,
      registeredUtc:new Date(time).toISOString(),maximumAgeMs:600000,
      protocol:'D_TOOL_BRIDGE_V1',capabilities:['takePending','canDispatch','execute','acceptResult'],
      productionAuthority:false};
    const file=path.join(directory,peerPrefix(peer,mode)+randomUUID()+'.json');seal(file,record);
    return {registered:true,registrationPath:file,registrationSha256:hash(read(file).bytes),
      registeredUtc:record.registeredUtc,providerPermissionProven:false,productionAuthority:false};
  }catch{throw Error('D_TOOL_PEER_REGISTRATION_INVALID');}
}
function registeredPeer(ctx){
  const peer=peerBinding({runId:ctx.b.runId,authorizationSha256:ctx.b.authorizationSha256,sourceCommit:ctx.b.sourceCommit,
    connectionBindingSha256:ctx.b.connectionBindingSha256,toolName:'mcp__cloudflare__execute'});
  const files=fs.readdirSync(ctx.directory).filter(name=>name.startsWith(peerPrefix(peer,ctx.mode))&&name.endsWith('.json'));
  if(files.length>64)fail();
  let current;
  for(const name of files){
    const record=json(path.join(ctx.directory,name)),time=ctx.now(),age=time-Date.parse(record.registeredUtc);
    if(record.kind!=='TRUSTED_CODEX_LOCAL_TOOL_PEER_NOT_PROVIDER_PERMISSION'||record.mode!==ctx.mode
      ||!isDeepStrictEqual(peerBinding(Object.fromEntries(Object.keys(peer).map(key=>[key,record[key]]))),peer)
      ||record.protocol!=='D_TOOL_BRIDGE_V1'||record.maximumAgeMs!==600000
      ||!isDeepStrictEqual(record.capabilities,['takePending','canDispatch','execute','acceptResult'])
      ||!utc(record.registeredUtc)||!Number.isFinite(time)||age<0||age>600000)continue;
    if(!current||record.registeredUtc>current.registeredUtc)current=record;
  }
  if(!current)fail();return current;
}

// The parent owns signature, source adoption, quota and pre-dispatch admission.
// sourcePath/sourceSha256 pin the supplied reviewed generator, not this module.
// verifyPrivateDirectory must synchronously verify owner/SYSTEM-only ACLs in
// production. SYNTHETIC permits delivery fixtures; it grants no production mode.
// onReady receives paths/instructions only; it must queue owner delivery without
// blocking. The downloaded generator result remains subject to validate(). Its
// source/nonce provenance is the sealed handoff, not invented provider evidence.
export function createDManualExecutionCarrier(options={}){
  options=Object.freeze({...options});
  const ctx=base(options),used=new Set();let stopped=false;
  let downloads;
  try{downloads=directoryPath(options.downloadsDirectory);
    if(options.onReady!==undefined&&typeof options.onReady!=='function'
      ||options.deliver!==undefined&&(ctx.mode!=='SYNTHETIC'||typeof options.deliver!=='function'))fail();
  }catch{throw Error('D_CARRIER_CONFIGURATION_INVALID');}
  const context=options.preparedContext?structuredClone(options.preparedContext):null;
  const ready=()=>{
    const local=ctx.ready();
    try{if(!local.ready||stopped)fail();directoryPath(downloads);
      if(ctx.mode==='PRODUCTION'||context){
        if(!context||Object.keys(context).sort().join(',')!=='origin,ownerPrepared,pathname'
          ||context.origin!=='https://openglasshub.ogh.workers.dev'||context.ownerPrepared!==true
          ||typeof context.pathname!=='string'||!/^\/[a-zA-Z0-9_/-]*$/.test(context.pathname)
          ||context.pathname.includes('//')||context.pathname.length>256)fail();
      }
      return {...local,downloadsDirectory:downloads,preparedContext:context?{...context}:null,
        browserSessionProven:false};
    }catch{return {...local,ready:false,browserSessionProven:false};}
  };
  return Object.freeze({ready,stop(){stopped=true;},async run(input={}){
    input=Object.freeze({...input});
    const id=input.requestId;let claimed=false;
    try{
      if(stopped||!identifier(id)||used.has(id)||!ready().ready)fail();used.add(id);
      const {code,deadlineUtc,validate,signal}=input;
      const started=ctx.check(deadlineUtc,signal);directoryPath(downloads);
      const name=input.resultName??`ogh-${id}.json`;
      if(typeof code!=='string'||!code.length||Buffer.byteLength(code)>32768||typeof validate!=='function'
        ||!/^ogh-[a-zA-Z0-9_-]{1,200}\.json$/.test(name))fail();safe(code);
      const codeSha256=hash(code);if(input.codeSha256!==undefined&&input.codeSha256!==codeSha256)fail();
      const resultPath=path.join(downloads,name),prefix=ctx.prefix(id);
      seal(prefix+'.manual.claim.json',{kind:'LOCAL_HANDOFF_CLAIM_NOT_DISPATCH',...stamp(ctx,id),deadlineUtc});claimed=true;
      if(exists(resultPath))fail();
      const codePath=prefix+'.manual.js',manifestPath=prefix+'.manual.outbox.json';
      seal(codePath,Buffer.from(code));
      const manifest={kind:'MANUAL_SAME_PAGE_HANDOFF_NOT_PERMISSION',...stamp(ctx,id),deadlineUtc,
        createdUtc:new Date(started).toISOString(),codeSha256,resultName:name,codePath,maxResultBytes:maximum,
        preparedContext:context};
      seal(manifestPath,manifest);ctx.check(deadlineUtc,signal);
      const instructions=Object.freeze({...manifest,manifestPath,
        instructions:'Use the approved same-page method. Invoke the supplied function once and retain its exact download filename.'});
      const deliveries=[options.onReady,options.deliver].filter(Boolean);let deliveryFailed=false;
      for(const delivery of deliveries){
        const returned=delivery(instructions);
        if(returned&&typeof returned.then==='function')Promise.resolve(returned).catch(()=>{deliveryFailed=true;});
      }
      for(;;){
        ctx.check(deadlineUtc,signal);directoryPath(downloads);
        if(stopped||deliveryFailed)fail();
        if(exists(resultPath)){
          const {bytes,stat}=read(resultPath);if(stat.mtimeMs<started)fail();
          const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));safe(result);
          if(result?.state==='UNKNOWN'||result?.binding!==ctx.b.executionBindingSha256
            ||input.resultName===undefined&&result?.requestId!==id
            ||result.sourceSha256!==undefined&&result.sourceSha256!==ctx.b.sourceSha256
            ||result.nonce!==undefined&&result.nonce!==ctx.b.nonce||synchronous(validate(result))!==true)fail();
          if(hash(read(codePath).bytes)!==codeSha256||!isDeepStrictEqual(json(manifestPath),manifest))fail();
          ctx.check(deadlineUtc,signal);
          seal(prefix+'.manual.result.json',{kind:'IMPORTED_CHECKPOINT_NOT_PERMISSION',...stamp(ctx,id),
            deadlineUtc,codeSha256,resultName:name,resultSha256:hash(bytes),result});
          ctx.check(deadlineUtc,signal);if(stopped)fail();return result;
        }
        await pause(Math.min(ctx.pollIntervalMs,Math.max(1,Date.parse(deadlineUtc)-ctx.now())),signal);
      }
    }catch{if(claimed)noteUnknown(ctx,id);return unknown(id);}
  }});
}

function unwrap(tool){
  if(!tool||tool.isError===true)fail();
  if(typeof tool.rawDecodedResponse==='string')return tool;
  if(!Array.isArray(tool.content)||tool.content.length!==1||tool.content[0]?.type!=='text')fail();
  const result=JSON.parse(tool.content[0].text);
  if(tool.structuredContent!==undefined&&!isDeepStrictEqual(result,tool.structuredContent))fail();return result;
}
function deletionResult(tool,request,ctx){
  const result=unwrap(tool),e=result?.evidence,text=result?.rawDecodedResponse;
  if(typeof text!=='string'||Buffer.byteLength(text)>maximum||text.includes('--- TRUNCATED ---')
    ||e?.requestId!==request.requestId||e.executionBindingSha256!==ctx.b.executionBindingSha256
    ||e.connectionBindingSha256!==ctx.b.connectionBindingSha256||e.account!==account||e.bucket!=='openglasshub-media'
    ||e.jurisdiction!=='default'||e.method!=='DELETE'||e.status!==200||e.complete!==true
    ||e.responseSha256!==hash(text)||!digest(e.creationReceiptSha256)
    ||!Array.isArray(e.keys)||!e.keys.length||e.keys.length>2||new Set(e.keys).size!==e.keys.length
    ||!e.keys.every(key=>typeof key==='string'&&key.startsWith('tmp/')&&key.length<=1024))fail();
  const body=JSON.parse(text);
  if(body.status!==200||body.success!==true||!Array.isArray(body.result)||body.result.length!==e.keys.length
    ||new Set(body.result.map(row=>row?.key)).size!==e.keys.length||!body.result.every(row=>e.keys.includes(row?.key))
    ||body.errors!==undefined&&(!Array.isArray(body.errors)||body.errors.length))fail();
  return result;
}

// Local-process bridge, not a local MCP client. The parent's journal must admit
// before execute(). plan(code,{account_id}) supplies {requestId,codeSha256,
// deadlineUtc,validate?}; validate is synchronous and additional to envelope checks.
//
// Trusted Codex recipe (never owner-uploaded JSON): construct another bridge with
// the SAME private directory/source/binding and ACL verifier; takePending() seals
// its one-time dispatch marker, then use its exact code/account_id and bound
// connection with tools.mcp__cloudflare__execute({code:ticket.code,
// account_id:ticket.account_id,truncate:false}). Pass the COMPLETE tool return
// and unchanged ticket to acceptResult({ticket,toolResult}) from the trusted
// Node process/REPL. Do not print bodies or use a fabricated result. If the tool
// throws, acceptResult({ticket,toolResult:{isError:true}}) records UNKNOWN. No
// second take, automatic tool retry, secret forwarding or provider client exists.
// Check canDispatch(ticket) immediately before the tool call; parent cancellation
// and expiry may have occurred since takePending(). A later returned response
// remains UNKNOWN even if a tool cannot prove cancellation of its native request.
export function createDMcpExecutionBridge(options={}){
  options=Object.freeze({...options});
  const ctx=base(options),used=new Set(),validators=new Map();let stopped=false;
  if(!digest(ctx.b.connectionBindingSha256)||options.plan!==undefined&&typeof options.plan!=='function'
    ||options.invoke!==undefined&&(ctx.mode!=='SYNTHETIC'||typeof options.invoke!=='function'))
    throw Error('D_CARRIER_CONFIGURATION_INVALID');
  const requestFile=id=>ctx.prefix(id)+'.mcp.request.json';
  const claimed=id=>exists(ctx.prefix(id)+'.mcp.dispatch.json');
  const done=id=>exists(ctx.prefix(id)+'.unknown.json')||exists(ctx.prefix(id)+'.tool-result.json');
  const verify=(request,allowExpired=false)=>{
    if(!identifier(request?.requestId)||!isDeepStrictEqual(Object.fromEntries(Object.keys(ctx.b).map(k=>[k,request[k]])),ctx.b)
      ||request.mode!==ctx.mode||request.account_id!==account||typeof request.code!=='string'||hash(request.code)!==request.codeSha256
      ||!utc(request.createdUtc)||!utc(request.deadlineUtc)||ctx.now()<Date.parse(request.createdUtc))fail();
    if(allowExpired){ctx.pins();if(!Number.isFinite(ctx.now()))fail();}else ctx.check(request.deadlineUtc);
    return request;
  };
  const ready=()=>{
    const local=ctx.ready();
    try{if(!local.ready||stopped)fail();
      const peer=ctx.mode==='PRODUCTION'||options.requireToolPeer===true?registeredPeer(ctx):null;
      return {...local,toolPeerRegistered:peer!==null,registeredUtc:peer?.registeredUtc??null,
        providerPermissionProven:false};
    }catch{return {...local,ready:false,toolPeerRegistered:false,providerPermissionProven:false};}
  };
  const bridge={ready,
    registerPeer(peer){
      try{
        ctx.pins();const expected=peerBinding({runId:ctx.b.runId,authorizationSha256:ctx.b.authorizationSha256,
          sourceCommit:ctx.b.sourceCommit,connectionBindingSha256:ctx.b.connectionBindingSha256,
          toolName:'mcp__cloudflare__execute'});
        if(!isDeepStrictEqual(peerBinding(peer),expected))fail();
        return registerDToolPeer(ctx.directory,peer,{mode:ctx.mode,verifyPrivateDirectory:options.verifyPrivateDirectory,now:ctx.now});
      }catch{throw Error('D_TOOL_PEER_REGISTRATION_INVALID');}
    },stop(){stopped=true;for(const id of used)if(!done(id))noteUnknown(ctx,id);},
    takePending(){
      try{
        ctx.pins();if(stopped||!ready().ready)return null;
        const files=fs.readdirSync(ctx.directory).filter(name=>name.startsWith(ctx.domain+'.')&&name.endsWith('.mcp.request.json')).sort();
        if(files.length>64)fail();
        for(const file of files){
          let request;
          try{
            request=json(path.join(ctx.directory,file));const id=request.requestId;
            if(!identifier(id)||path.basename(requestFile(id))!==file)fail();
            if(claimed(id)||done(id))continue;
            verify(request);
            const ticket={...request,dispatchId:randomUUID()};
            seal(ctx.prefix(id)+'.mcp.dispatch.json',ticket);
            verify(request);if(stopped)fail();return Object.freeze(ticket);
          }catch{if(request&&identifier(request.requestId))noteUnknown(ctx,request.requestId);}
        }
      }catch{stopped=true;}
      return null;
    },
    canDispatch(ticket){
      try{if(stopped||!ready().ready||!identifier(ticket?.requestId)||done(ticket.requestId))return false;
        verify(json(requestFile(ticket.requestId)));
        return isDeepStrictEqual(json(ctx.prefix(ticket.requestId)+'.mcp.dispatch.json'),ticket);
      }catch{return false;}
    },
    acceptResult({ticket,toolResult}={}){
      const id=ticket?.requestId;
      try{
        if(!identifier(id)||exists(ctx.prefix(id)+'.tool-result.json')||!claimed(id))fail();
        const request=verify(json(requestFile(id)),true),sealed=json(ctx.prefix(id)+'.mcp.dispatch.json');
        if(!isDeepStrictEqual(sealed,ticket))fail();
        safe(toolResult);const serialized=JSON.stringify(toolResult);
        if(typeof serialized!=='string'||Buffer.byteLength(serialized)>maximum)fail();
        seal(ctx.prefix(id)+'.tool-result.json',{kind:'TRUSTED_CODEX_FULL_TOOL_RETURN_NOT_ACCEPTANCE',...stamp(ctx,id),
          codeSha256:request.codeSha256,dispatchId:ticket.dispatchId,toolResultSha256:hash(serialized),
          observedUtc:new Date(ctx.now()).toISOString(),toolResult});
        if(stopped||exists(ctx.prefix(id)+'.unknown.json')||serialized.includes('--- TRUNCATED ---'))fail();
        const result=deletionResult(toolResult,request,ctx);safe(result);verify(request);
        seal(ctx.prefix(id)+'.tool-accepted.json',{kind:'TOOL_ENVELOPE_VALIDATED_NOT_PERMISSION',...stamp(ctx,id),
          dispatchId:ticket.dispatchId,codeSha256:request.codeSha256,toolResultSha256:hash(serialized)});
        verify(request);return {accepted:true,requestId:id,productionAuthority:false};
      }catch{noteUnknown(ctx,id);return {accepted:false,requestId:identifier(id)?id:null,state:'UNKNOWN',productionAuthority:false};}
    },
    async execute(code,args,signal){
      let id,onAbort;
      try{
        if(stopped||!ready().ready||typeof options.plan!=='function'||typeof code!=='string'||!code.length||Buffer.byteLength(code)>32768
          ||!args||Object.keys(args).join(',')!=='account_id'||args.account_id!==account)fail();safe(code);
        const meta=Object.freeze({...synchronous(options.plan(code,Object.freeze({...args})))});id=meta?.requestId;
        if(!identifier(id)||used.has(id)||meta.codeSha256!==hash(code)||meta.validate!==undefined&&typeof meta.validate!=='function')fail();
        used.add(id);ctx.check(meta.deadlineUtc,signal);if(meta.validate)validators.set(id,meta.validate);
        const request={kind:'MCP_TOOL_HANDOFF_NOT_DISPATCH',...stamp(ctx,id),account_id:account,code,
          codeSha256:meta.codeSha256,deadlineUtc:meta.deadlineUtc,createdUtc:new Date(ctx.now()).toISOString()};
        seal(requestFile(id),request);
        onAbort=()=>noteUnknown(ctx,id);signal?.addEventListener('abort',onAbort,{once:true});
        ctx.check(meta.deadlineUtc,signal);
        if(options.onReady){const returned=options.onReady(Object.freeze({requestId:id,requestPath:requestFile(id),
          deadlineUtc:meta.deadlineUtc,productionAuthority:false}));
          if(returned&&typeof returned.then==='function')Promise.resolve(returned).catch(()=>{noteUnknown(ctx,id);});}
        if(options.invoke){const ticket=bridge.takePending();if(!ticket||ticket.requestId!==id)fail();
          Promise.resolve().then(()=>options.invoke(ticket)).then(toolResult=>bridge.acceptResult({ticket,toolResult}),
            ()=>bridge.acceptResult({ticket,toolResult:{isError:true}}));}
        for(;;){
          ctx.check(meta.deadlineUtc,signal);if(stopped||exists(ctx.prefix(id)+'.unknown.json'))fail();
          const file=ctx.prefix(id)+'.tool-result.json';
          if(exists(ctx.prefix(id)+'.tool-accepted.json')){
            const captured=json(file),ticket=json(ctx.prefix(id)+'.mcp.dispatch.json'),accepted=json(ctx.prefix(id)+'.tool-accepted.json');
            if(captured.codeSha256!==request.codeSha256||captured.dispatchId!==ticket.dispatchId
              ||captured.executionBindingSha256!==ctx.b.executionBindingSha256||captured.sourceSha256!==ctx.b.sourceSha256
              ||captured.nonce!==ctx.b.nonce||captured.toolResultSha256!==hash(JSON.stringify(captured.toolResult))
              ||accepted.dispatchId!==ticket.dispatchId||accepted.codeSha256!==request.codeSha256
              ||accepted.toolResultSha256!==captured.toolResultSha256||accepted.nonce!==ctx.b.nonce
              ||accepted.executionBindingSha256!==ctx.b.executionBindingSha256||accepted.sourceSha256!==ctx.b.sourceSha256
              ||captured.mode!==ctx.mode||accepted.mode!==ctx.mode)fail();
            const result=deletionResult(captured.toolResult,request,ctx);
            if(validators.has(id)&&synchronous(validators.get(id)(result))!==true)fail();
            ctx.check(meta.deadlineUtc,signal);if(stopped)fail();return result;
          }
          await pause(Math.min(ctx.pollIntervalMs,Math.max(1,Date.parse(meta.deadlineUtc)-ctx.now())),signal);
        }
      }catch{noteUnknown(ctx,id);return unknown(id);}
      finally{if(onAbort)signal?.removeEventListener('abort',onAbort);validators.delete(id);}
    }};
  return Object.freeze(bridge);
}
