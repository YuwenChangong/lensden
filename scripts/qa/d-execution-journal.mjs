import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const dHash = value => createHash('sha256').update(value).digest('hex');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const safeId = v => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(v);
export const D_LIMITS = Object.freeze({Auth:11, REST:12, Worker:12, HEAD:6, management:2});
export const D_CLEANUP_RESERVE = Object.freeze({Auth:4, REST:2, Worker:2, HEAD:4, management:1});

export function sealDRecord(file, record) {
  const bytes = Buffer.from(JSON.stringify(record) + '\n');
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (!fs.lstatSync(file).isFile() || !fs.readFileSync(file).equals(bytes)) throw Error('D_RECEIPT_UNPROVEN');
}

// Receipts are append-only. An intent is an irreversible debit, even if the
// process dies before the carrier can acknowledge dispatch.
export function openDJournal({directory, binding, limits=D_LIMITS, reserve=D_CLEANUP_RESERVE,
  now=Date.now, resume=false, admit=()=>true}) {
  if (!path.isAbsolute(directory) || !fs.lstatSync(directory).isDirectory()
    || !digest(binding?.authorizationSha256) || !/^[a-f0-9]{40}$/.test(binding.sourceCommit)
    || !/^[a-zA-Z0-9_-]{16,128}$/.test(binding.runId)
    || !Number.isFinite(Date.parse(binding.notBeforeUtc)) || !Number.isFinite(Date.parse(binding.deadlineUtc))
    || !Number.isFinite(Date.parse(binding.businessStopUtc))
    || Date.parse(binding.deadlineUtc)-Date.parse(binding.notBeforeUtc)>10800000
    || Date.parse(binding.businessStopUtc)>Date.parse(binding.notBeforeUtc)+8100000
    || Date.parse(binding.businessStopUtc)<=Date.parse(binding.notBeforeUtc)
    || Date.parse(binding.deadlineUtc)<=Date.parse(binding.businessStopUtc)||typeof admit!=='function') throw Error('D_JOURNAL_BINDING_INVALID');
  for (const k of Object.keys(D_LIMITS)) if (!Number.isInteger(limits[k]) || limits[k]<0 || limits[k]>D_LIMITS[k]
    || !Number.isInteger(reserve[k]) || reserve[k]<D_CLEANUP_RESERVE[k] || reserve[k]>limits[k])
    throw Error('D_JOURNAL_BUDGET_INVALID');
  const fixed=structuredClone({binding,limits,reserve}), entries=[], intents=new Map(), replies=new Map();
  const used=Object.fromEntries(Object.keys(D_LIMITS).map(k=>[k,0])); let stopped=false, busy=false;
  if(fs.readdirSync(directory).some(n=>/^d-receipt-.*\.publishing$/.test(n)))throw Error('D_JOURNAL_INCOMPLETE_WRITE_RESIDUAL');
  const files=fs.readdirSync(directory).filter(n=>/^d-receipt-\d{6}\.json$/.test(n)).sort();
  let previous='0'.repeat(64);
  for (const name of files) {
    const file=path.join(directory,name), stat=fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size>262144) throw Error('D_JOURNAL_CORRUPT');
    const bytes=fs.readFileSync(file), e=JSON.parse(bytes);
    const {recordSha256,...content}=e;
    if (e.sequence!==entries.length+1 || name!==`d-receipt-${String(e.sequence).padStart(6,'0')}.json`
      || recordSha256!==dHash(JSON.stringify(content))
      || e.previous!==previous || e.bindingSha256!==dHash(JSON.stringify(fixed))) throw Error('D_JOURNAL_CORRUPT');
    if (e.kind==='INTENT') {
      if (!safeId(e.id)||intents.has(e.id)) throw Error('D_JOURNAL_CORRUPT');
      for (const k of Object.keys(used)) { if (!Number.isInteger(e.cost[k])||e.cost[k]<0) throw Error('D_JOURNAL_CORRUPT'); used[k]+=e.cost[k]; }
      intents.set(e.id,e);
    } else if (e.kind==='ACK'||e.kind==='UNKNOWN') {
      if (!intents.has(e.id)||replies.has(e.id)&&!(e.kind==='UNKNOWN'&&replies.get(e.id).kind==='ACK')) throw Error('D_JOURNAL_CORRUPT'); replies.set(e.id,e);
      if(e.kind==='ACK'&&e.resultSha256!==dHash(JSON.stringify(e.result)))throw Error('D_JOURNAL_CORRUPT');
    }
    entries.push(e); previous=dHash(bytes);
  }
  if (Object.keys(used).some(k=>used[k]>limits[k])) throw Error('D_JOURNAL_OVERDRAWN');
  if (!resume && files.length) throw Error('D_RUN_ALREADY_CONSUMED');
  const append=(kind,data)=>{
    const e={sequence:entries.length+1,previous,bindingSha256:dHash(JSON.stringify(fixed)),kind,
      recordedUtc:new Date(now()).toISOString(),...data};
    e.recordSha256=dHash(JSON.stringify(e));
    const file=path.join(directory,`d-receipt-${String(e.sequence).padStart(6,'0')}.json`);
    // Publish only after fsync/readback. A failed or interrupted fsync leaves a
    // visible incomplete-write fence, never an ACK accepted by a fresh process.
    if(fs.existsSync(file))throw Error('D_JOURNAL_SEQUENCE_ALREADY_EXISTS');
    sealDRecord(file+'.publishing',e);
    // link is atomic no-replace on the supported local filesystem; rename can
    // overwrite a competing writer's final receipt after an exists() race.
    fs.linkSync(file+'.publishing',file);fs.unlinkSync(file+'.publishing');
    const saved=fs.readFileSync(file);if(!saved.equals(Buffer.from(JSON.stringify(e)+'\n')))throw Error('D_RECEIPT_UNPROVEN');
    previous=dHash(saved); entries.push(e); return e;
  };
  const check=(cleanup=false)=>{
    const time=now();
    if (!Number.isFinite(time)||time<Date.parse(binding.notBeforeUtc)||time>=Date.parse(binding.deadlineUtc)||admit()!==true
      || (!cleanup&&(stopped||time>=Date.parse(binding.businessStopUtc)))) throw Error('D_WINDOW_STOPPED');
  };
  if (!resume) append('START',{fixed});
  else if (entries[0]?.kind!=='START'||JSON.stringify(entries[0].fixed)!==JSON.stringify(fixed)) throw Error('D_RESUME_BINDING_INVALID');
  const api={
    binding:structuredClone(binding),
    status:()=>({used:{...used},stopped,pending:[...intents.keys()].filter(id=>!replies.has(id)||replies.get(id).kind==='UNKNOWN'),
      acknowledged:[...replies].filter(([,r])=>r.kind==='ACK').map(([id])=>id)}),
    stop(reason='BUSINESS_STOPPED'){stopped=true;append('STOP',{reason:/^[A-Z0-9_]{1,100}$/.test(reason)?reason:'STOPPED'});},
    record(kind,data){if(!/^[A-Z_]{1,50}$/.test(kind)||['INTENT','ACK','UNKNOWN','START'].includes(kind))throw Error('D_RECORD_KIND_INVALID');return append(kind,data);},
    cached(id){const r=replies.get(id);return r?.kind==='ACK'?structuredClone(r.result):undefined;},
    records:()=>structuredClone(entries),
    hasIntent:id=>intents.has(id),
    reserve({id,cost={},cleanup=false,request,operationDeadlineUtc}) {
      if(!safeId(id)||intents.has(id))throw Error('D_OPERATION_ALREADY_DEBITED');
      if(resume&&!cleanup)throw Error('D_BUSINESS_RESUME_FORBIDDEN');
      check(cleanup);
      if(operationDeadlineUtc!==undefined&&(!Number.isFinite(Date.parse(operationDeadlineUtc))
        ||now()>=Date.parse(operationDeadlineUtc)))throw Error('D_OPERATION_EXPIRED');
      const debit=Object.fromEntries(Object.keys(used).map(k=>[k,cost[k]??0]));
      if(Object.keys(cost).some(k=>!(k in used))||Object.values(debit).some(v=>!Number.isInteger(v)||v<0)
        ||!Object.values(debit).some(v=>v>0))throw Error('D_COST_INVALID');
      for(const k of Object.keys(used))if(used[k]+debit[k]>limits[k]-(cleanup?0:reserve[k]))throw Error('D_CLEANUP_BUDGET_RESERVED');
      const e=append('INTENT',{id,cost:debit,cleanup,...operationDeadlineUtc?{operationDeadlineUtc}:{},requestSha256:dHash(JSON.stringify(request??{}))});
      intents.set(id,e);for(const k of Object.keys(used))used[k]+=debit[k];
      check(cleanup);if(operationDeadlineUtc!==undefined&&now()>=Date.parse(operationDeadlineUtc)){api.unknown(id);throw Error('D_OPERATION_EXPIRED');}
      return true;
    },
    acknowledge(id,result,validate) {
      const e=intents.get(id);if(!e||replies.has(id))throw Error('D_ACK_WITHOUT_INTENT');
      check(e.cleanup);
      const deadline=e.operationDeadlineUtc===undefined?Date.parse(binding.deadlineUtc):Date.parse(e.operationDeadlineUtc);
      if(now()>=deadline)throw Error('D_RESPONSE_LATE');
      if(typeof validate!=='function'||validate(result)!==true)throw Error('D_RESPONSE_UNPROVEN');
      if(now()>=deadline)throw Error('D_RESPONSE_LATE');
      append('RESPONSE',{id,result,resultSha256:dHash(JSON.stringify(result))});
      check(e.cleanup);if(now()>=deadline)throw Error('D_RESPONSE_PERSISTED_LATE');
      const r=append('ACK',{id,result,resultSha256:dHash(JSON.stringify(result))});replies.set(id,r);
      if(now()>=deadline){api.unknown(id);throw Error('D_ACK_PERSISTED_LATE');}check(e.cleanup);return result;
    },
    unknown(id) {
      if(!intents.has(id)||replies.get(id)?.kind==='UNKNOWN')return;
      stopped=true;const r=append('UNKNOWN',{id});replies.set(id,r);
    },
    async call({id,cost={},cleanup=false,request,timeoutMs=10000,signal},operation,validate) {
      if (busy) throw Error('D_CONCURRENT_DISPATCH_BLOCKED');
      if (!safeId(id)||typeof operation!=='function'||typeof validate!=='function'
        ||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>(request?.manual===true?120000:10000)) throw Error('D_OPERATION_INVALID');
      if (resume&&!cleanup) throw Error('D_BUSINESS_RESUME_FORBIDDEN');
      if (intents.has(id)) throw Error('D_OPERATION_ALREADY_DEBITED');
      check(cleanup); if(signal?.aborted)throw Error('D_OPERATION_ABORTED');
      busy=true;let timer,active=true;const abort=new AbortController();
      const onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});
      try {
        const operationDeadline=Math.min(now()+timeoutMs,Date.parse(binding.deadlineUtc));
        api.reserve({id,cost,cleanup,request,operationDeadlineUtc:new Date(operationDeadline).toISOString()});
        check(cleanup);
        const work=Promise.resolve().then(async()=>{if(abort.signal.aborted||now()>=operationDeadline)throw Error();const value=await operation(abort.signal);
          if(!active||abort.signal.aborted)throw Error();check(cleanup);
          if(now()>=operationDeadline||validate(value)!==true||now()>=operationDeadline)throw Error('D_RESPONSE_UNPROVEN');return value;});
        const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('D_OPERATION_TIMEOUT'));},
          Math.max(1,operationDeadline-now()));})]);
        return api.acknowledge(id,result,validate);
      } catch {
        stopped=true;
        api.unknown(id);
        throw Error('D_OPERATION_UNKNOWN_NO_RETRY');
      } finally {active=false;clearTimeout(timer);abort.abort();signal?.removeEventListener('abort',onAbort);busy=false;}
    }
  };
  return Object.freeze(api);
}
