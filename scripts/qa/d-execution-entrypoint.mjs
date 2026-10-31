import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildDProductionCreation, buildDPartialSourceCreation, createDProductionCleanupCallbacks} from './d-production-bindings.mjs';
import {runDBoundCleanup} from './legacy-tmp-lifecycle-safety.mjs';
import {dHash} from './d-execution-journal.mjs';
import {isDProductionPorts} from './d-execution-runtime.mjs';

const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const bytes=v=>Buffer.isBuffer(v)?v:Buffer.from(typeof v==='string'?v:JSON.stringify(v));
const read=v=>JSON.parse(bytes(v));
const goodVideo=v=>v?.status==='PASS_FETCH_HASH_AND_DECODE'&&v.httpStatus===200&&v.bytes===2018
  &&v.sha256Match===true&&v.decode?.width>0&&v.decode.height>0&&v.decode.currentTime>0.05&&v.decode.errorNull===true;

// The production CLI constructs the real carriers. Injected ports below are a
// local integration seam, never an authorization or a claim of Production PASS.
export async function runDExecution({journal, ports, binding, targets, now=Date.now,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)), resumeCleanup=false}) {
  if(ports.production===true&&!isDProductionPorts(ports))throw Error('D_SYNTHETIC_PORTS_CANNOT_BECOME_PRODUCTION');
  const out={mode:ports.production===true?'PRODUCTION':'SYNTHETIC',state:'BLOCKED',assertions:{},
    cleanup:'NOT_RUN',actorContained:false,residuals:[],productionAuthority:false};
  let actor,creationRaw,created,postState,headVerifier,callbacks,cleanupAttempted=false;
  const ctx={...binding};
  const call=(id,cost,operation,validate,cleanup=false,manual=true)=>journal.call({id,cost,cleanup,
    timeoutMs:manual?120000:10000,request:{manual,phase:id}},operation,validate);
  const persistCreation=raw=>{
    creationRaw=Buffer.from(raw);created=read(raw);ctx.postId=created.postId;
    journal.record('CREATION_OBLIGATION',{creationRaw:creationRaw.toString('utf8'),actorCreationRaw:actor.actorCreationRaw,
      binding:ctx,postState,keys:created.keys});
  };
  const bindCleanup=()=>{
    headVerifier=ports.headVerifier({binding:ctx,creationRaw,journal});
    callbacks=createDProductionCleanupCallbacks({binding:ctx,creationRaw,actorCreationRaw:bytes(actor.actorCreationRaw),
      actorContainment:ports.containActor,
      ownerCheckpoint:(code,p,signal)=>ports.checkpoint(code,p,signal,journal),
      moderatorCheckpoint:(code,p,signal)=>ports.checkpoint(code,p,signal,journal),
      mcpExecute:(code,options,signal)=>call('EXACT_SOURCE_DELETE',{management:1},
        s=>ports.mcpExecute(code,options,s),r=>r?.evidence?.status===200&&r.evidence.complete===true,true,false),
      anonymousReadback:async p=>call('ANONYMOUS_AFTER_DELETE',{Worker:1},
        signal=>ports.video({...p,firstObservedUtc:null},signal),r=>r?.status==='PASS_DENIED'&&r.httpStatus===404,true),
      beforeDispatch:async phase=>{
        if(phase==='EXACT_OBJECT_DELETE'&&ports.prepareMcp)await ports.prepareMcp();
        return now()<Date.parse(binding.deadlineUtc);
      },logoutTimeoutMs:30000});
  };
  const cleanup=async()=>{
    cleanupAttempted=true;
    const result=await runDBoundCleanup({creationRaw,actorCreationRaw:bytes(actor.actorCreationRaw),postState,
      target:ctx,callbacks,headVerifier,callbackTimeoutMs:120000,containmentTimeoutMs:120000});
    out.cleanup=result.state;out.actorContained=result.actorContained;
    journal.record('CLEANUP_RESULT',{result});
    if(result.state!=='CLEANUP_SEQUENCE_VERIFIED')out.residuals.push({kind:'CLEANUP_UNPROVEN',keys:created.keys,
      phase:result.failedPhase??result.phase,objectOutcomes:result.objectOutcomes});
    return result;
  };
  try {
    if(resumeCleanup) {
      const recovered=await recoverDUnissuedCleanup({journal,ports,binding});
      Object.assign(out,recovered);
      return out;
    }
    await ports.prepare({journal,binding,targets});
    // The child displays the new fixture password locally before it returns.
    // Reserve normal login/legal traffic first, not after the owner has logged in.
    journal.reserve({id:'ORDINARY_LOGIN_AND_LEGAL',cost:{Auth:1,Worker:1},request:{normalLoginOnce:true,legalConsentMaximum:1}});
    actor=await ports.createActor({journal,binding,targets});
    const a=read(actor.actorCreationRaw);
    if(!uuid(actor.actorId)||a.actorId!==actor.actorId||a.createdByThisRun!==true
      ||a.executionBindingSha256!==binding.executionBindingSha256)throw Error('ACTOR_DISPATCH_RECEIPTS_MISSING');
    Object.assign(ctx,{actorId:actor.actorId,actorEmail:actor.email,createdAt:actor.createdAt,namespace:targets.namespace,
      actorCreationReceiptSha256:dHash(bytes(actor.actorCreationRaw))});
    journal.record('ACTOR_OBLIGATION',{actor});
    if(!journal.cached('ACTOR_CREATE')||!journal.cached('ACTOR_INITIAL_READ')||actor.state==='UNKNOWN')throw Error('ACTOR_READBACK_OR_DISPLAY_UNPROVEN');
    const identity=await call('ORDINARY_IDENTITY',{Auth:1,REST:2},
      signal=>ports.identity(ctx,signal),r=>r?.actorId===ctx.actorId&&r.confirmed===true&&r.role==='user'
        &&r.circleMatches===true&&r.normalLoginConfirmed===true&&r.legalReady===true);
    journal.acknowledge('ORDINARY_LOGIN_AND_LEGAL',{normalLoginConfirmed:true,legalReady:true},r=>r.normalLoginConfirmed&&r.legalReady);
    ctx.identityReceiptSha256=dHash(bytes(identity));ctx.ownerContextReceiptSha256=ctx.identityReceiptSha256;
    out.assertions.ordinaryIdentity='PASS';
    // One conservative extra Worker debit covers the frozen form's conditional
    // native rollback. It is never refunded or permission for a second DELETE.
    const capture=await call('CREATE_POST_AND_VIDEO',{Worker:4},signal=>ports.upload(ctx,signal),
      r=>r?.binding===ctx.executionBindingSha256&&r.actorId===ctx.actorId&&uuid(r.postId)
        &&['OBSERVED_REQUIRES_SERVER_READBACK','STOPPED_UNKNOWN'].includes(r.status));
    ctx.postId=capture.postId;ctx.mediaId=capture.mediaId;
    if(capture.status!=='OBSERVED_REQUIRES_SERVER_READBACK') {
      const partial={...ctx,creationMode:'SOURCE_UPLOAD_RECOVERY_V1'};
      const recovered=buildDPartialSourceCreation({captureRaw:bytes(capture),binding:partial});Object.assign(ctx,partial);
      postState='deleted';persistCreation(recovered.creationRaw);bindCleanup();throw Error('UPLOAD_PARTIAL_SOURCE_RECOVERY');
    }
    const snapshot=await call('CREATION_SNAPSHOT',{REST:3},signal=>ports.snapshot(ctx,signal),
      r=>r?.post?.id===ctx.postId&&r.post.author_id===ctx.actorId);
    postState=snapshot.post.status;
    const chain=buildDProductionCreation({captureRaw:bytes(capture),snapshotRaw:bytes(snapshot),binding:ctx});
    ctx.creationMode='SERVER_RECEIPT_V2';persistCreation(chain.creationRaw);bindCleanup();
    for(const key of created.keys) {
      const h=await headVerifier.head({phase:'AFTER_CREATE',key,creationRaw});
      if(h.state!=='PRESENT'||h.storageClass!=='Standard')throw Error('R2_OBJECT_METADATA_UNPROVEN');
    }
    out.assertions.uploadAndObjectMetadata='PASS';
    await call('ANONYMOUS_BEFORE_PUBLIC',{Worker:1},signal=>ports.video({mediaId:created.mediaId,stage:'before-public'},signal),
      r=>r?.status==='PASS_DENIED'&&r.httpStatus===404);
    out.assertions.unpublishedDenied='PASS';
    const approval=await call('APPROVE_EXACT_POST',{Worker:1},signal=>ports.approve({...ctx,mediaId:created.mediaId},signal),
      r=>r?.postId===ctx.postId&&r.actorId===ctx.actorId&&r.status==='published'&&r.moderationStatus==='published');
    postState=approval.status;
    journal.record('PUBLIC_POST_OBLIGATION',{postId:ctx.postId,creationSha256:dHash(creationRaw)});
    const first=await call('PLAY_PUBLISHED',{Worker:1},signal=>ports.video({mediaId:created.mediaId,stage:'published'},signal),goodVideo);
    out.assertions.browserDecode='PASS';const firstObservedUtc=new Date(now()).toISOString();
    await wait(Math.max(0,600000-(now()-Date.parse(firstObservedUtc))));
    if(now()-Date.parse(firstObservedUtc)<600000)throw Error('PERSISTENCE_TIME_UNPROVEN');
    await call('PLAY_DELAYED',{Worker:1},signal=>ports.video({mediaId:created.mediaId,stage:'delayed-published',firstObservedUtc},signal),goodVideo);
    const delayed=await call('PERSISTENCE_SNAPSHOT',{REST:3},signal=>ports.snapshot(ctx,signal),
      r=>r?.post?.id===ctx.postId&&r.post.author_id===ctx.actorId&&r.post.status==='published'
        &&r.media?.length===1&&r.media[0].storage_path===created.keys[1]&&r.claim?.retained_key===created.keys[1]);
    if(dHash(bytes(delayed.media))!==dHash(bytes(snapshot.media)))throw Error('PERSISTENCE_METADATA_CHANGED');
    out.assertions.tenMinutePersistence='PASS';out.assertions.accessControl='PASS';
    const finished=await cleanup();
    if(finished.state!=='CLEANUP_SEQUENCE_VERIFIED'||!finished.actorContained)throw Error('CLEANUP_UNPROVEN');
    out.assertions.authorDelete='PASS';out.assertions.independentObjectAbsence='PASS';
    out.assertions.forumAndActorCleanup='PASS';out.state=ports.production===true?'PRODUCTION_PASS':'SYNTHETIC_PASS';
  } catch {
    journal.stop('D_BUSINESS_STOPPED');
    out.state='BLOCKED';
    if(!actor&&ports.knownCreatedActor)actor=ports.knownCreatedActor();
    if(actor&&!ctx.actorId) {
      const a=read(actor.actorCreationRaw);
      if(a.actorId===actor.actorId&&a.createdByThisRun===true&&a.executionBindingSha256===binding.executionBindingSha256)
        Object.assign(ctx,{actorId:actor.actorId,actorEmail:actor.email,createdAt:actor.createdAt,namespace:targets.namespace,
          actorCreationReceiptSha256:dHash(bytes(actor.actorCreationRaw))});
    }
    if(actor) {
      if(creationRaw&&callbacks&&!cleanupAttempted)try{await cleanup();}catch{}
      if(!out.actorContained&&!cleanupAttempted)try {
        const result=await ports.containActor({binding:ctx,actorCreationRaw:bytes(actor.actorCreationRaw),logoutEvidence:null});
        out.actorContained=result.banned===true&&result.independentReadback===true&&result.signedOut===true;
      }catch{}
      if(!creationRaw)out.residuals.push({kind:'CREATION_OR_KEYS_UNPROVEN',actorId:actor.actorId,postId:ctx.postId??null});
      if(!out.actorContained)out.residuals.push({kind:'ACTOR_CONTAINMENT_UNPROVEN',actorId:actor.actorId});
    }
  } finally {
    try{headVerifier?.close();}catch{out.residuals.push({kind:'HEAD_CLIENT_CLOSE_UNVERIFIED'});out.state='BLOCKED';}
    try{const closed=await ports.close?.();out.tokenStatus=closed?.tokenStatus??'UNKNOWN';
      if(ports.production===true&&closed?.childReaped!==true){out.state='BLOCKED';out.residuals.push({kind:'CHILD_PROCESS_CLOSE_UNVERIFIED'});}}
    catch{out.tokenStatus='UNKNOWN';}
    if(ports.production===true&&out.tokenStatus!=='REVOKED'){
      out.state='BLOCKED';out.residuals.push({kind:'TOKEN_REVOCATION_UNVERIFIED'});
    }
    journal.record('FINAL',{result:out,accounting:journal.status()});
  }
  return out;
}

// Crash recovery spends only unissued cleanup allowances. It never reconnects a
// consumed private-input pipe, repeats a pending request, or reruns business.
export async function recoverDUnissuedCleanup({journal,ports,binding}) {
  const records=journal.records(),last=kind=>records.filter(r=>r.kind===kind).at(-1);
  let actor=last('ACTOR_OBLIGATION')?.actor;
  if(!actor){const a=journal.cached('ACTOR_CREATE')?.actorCreation;
    if(a){const c=read(a);actor={actorId:c.actorId,actorCreationRaw:a,createdAt:c.createdUtc,
      email:ports.targets.controlledAlias};}}
  const result={state:'BLOCKED',cleanup:'RECOVERY_RESIDUAL',actorContained:false,residuals:[]};let recoveryCallbacks;
  if(!actor){result.residuals.push({kind:'ACTOR_CREATION_UNKNOWN_NO_ID_ADOPTION'});return result;}
  const obligation=last('CREATION_OBLIGATION');
  const ctx=obligation?.binding??{...binding,actorId:actor.actorId,actorEmail:actor.email,createdAt:actor.createdAt,
    namespace:ports.targets.namespace,actorCreationReceiptSha256:dHash(bytes(actor.actorCreationRaw))};
  try {
    if(!obligation)throw Error('NO_TRUSTED_OBJECT_KEYS');
    const raw=bytes(obligation.creationRaw),c=read(raw),partial=ctx.creationMode==='SOURCE_UPLOAD_RECOVERY_V1';
    if(c.actorId!==ctx.actorId||c.postId!==ctx.postId||c.account!=='dcb374166b39234a499985145c075f50'
      ||c.bucket!=='openglasshub-media'||c.executionBindingSha256!==binding.executionBindingSha256
      ||c.actorCreationReceiptSha256!==dHash(bytes(actor.actorCreationRaw))||!Array.isArray(c.keys)||c.keys.length!==(partial?1:2))throw Error();
    const before=c.keys.map(key=>journal.cached('HEAD_BEFORE_DELETE_'+(key.startsWith('tmp/')?'SOURCE':'RETAINED')));
    if(!before.every((r,i)=>r?.state==='PRESENT'&&r.source.key===c.keys[i]&&r.source.creationReceiptSha256===dHash(raw)))throw Error('PREDELETE_PROOF_UNAVAILABLE');
    const callbacks=recoveryCallbacks=createDProductionCleanupCallbacks({binding:ctx,creationRaw:raw,actorCreationRaw:bytes(actor.actorCreationRaw),
      actorContainment:ports.containActor,ownerCheckpoint:(code,p,signal)=>ports.checkpoint(code,p,signal,journal),
      moderatorCheckpoint:(code,p,signal)=>ports.checkpoint(code,p,signal,journal),
      anonymousReadback:async p=>journal.cached('ANONYMOUS_AFTER_DELETE')??journal.call({id:'ANONYMOUS_AFTER_DELETE',cost:{Worker:1},
        cleanup:true,request:{manual:true},timeoutMs:120000},s=>ports.video(p,s),r=>r?.status==='PASS_DENIED'&&r.httpStatus===404),
      mcpExecute:async(code,options,signal)=>{
        const cached=journal.cached('EXACT_SOURCE_DELETE');if(cached)return cached;
        await ports.prepareMcp?.();
        return journal.call({id:'EXACT_SOURCE_DELETE',cost:{management:1},cleanup:true,request:{method:'DELETE'},signal},
          s=>ports.mcpExecute(code,options,s),r=>r?.evidence?.status===200&&r.evidence.complete===true);
      },beforeDispatch:async()=>Date.now()<Date.parse(binding.deadlineUtc),logoutTimeoutMs:30000});
    let owner;
    if(!partial){owner=await callbacks.ownerDelete(ctx.postId);if(owner.postState!=='deleted')throw Error();
      const post=await callbacks.readPost(ctx.postId);if(post.postState!=='deleted'||post.anonymousStatus!==404)throw Error();}
    const source=c.keys.find(k=>k.startsWith('tmp/'));
    const deletion=await callbacks.deleteExactObjects([source]);
    if(deletion.evidence.creationReceiptSha256!==dHash(raw)||deletion.evidence.keys.length!==1||deletion.evidence.keys[0]!==source)throw Error();
    if(partial)await callbacks.readPost(ctx.postId);
    // Retain the proof boundary: after a crash no new S3 credential input or
    // replacement HEAD is implicitly authorized. Existing acknowledged results
    // can be reported, but recovery alone never upgrades D to Production PASS.
    const absent=c.keys.every(key=>{
      const h=journal.cached('HEAD_AFTER_DELETE_'+(key.startsWith('tmp/')?'SOURCE':'RETAINED'));
      return h?.state==='ABSENT'&&h.response?.status===404&&h.source.key===key
        &&h.source.creationReceiptSha256===dHash(raw)&&h.source.executionBindingSha256===binding.executionBindingSha256;
    });
    result.cleanup=absent?'ACKNOWLEDGED_CLEANUP_RECOVERED_NOT_D_PASS':'DELETIONS_ACKNOWLEDGED_ABSENCE_UNKNOWN';
    if(!absent)result.residuals.push({kind:'INDEPENDENT_ABSENCE_UNVERIFIED_AFTER_RECOVERY',keys:c.keys});
  } catch {result.residuals.push({kind:'OBJECT_OR_POST_CLEANUP_RESIDUAL',actorId:actor.actorId,
    keys:obligation?read(obligation.creationRaw).keys:[],pending:journal.status().pending});}
  try {
    const old=last('CLEANUP_RESULT')?.result;
    if(old?.actorContained===true)result.actorContained=true;
    else {
      const r=recoveryCallbacks?await recoveryCallbacks.finishActor(ctx.actorId):await ports.containActor({binding:ctx,
        actorCreationRaw:bytes(actor.actorCreationRaw),logoutEvidence:journal.cached('ACTOR_LOGOUT')??null});
      result.actorContained=r.signedOut===true&&r.banned===true&&r.independentReadback===true;
    }
  } catch{}
  if(!result.actorContained)result.residuals.push({kind:'ACTOR_CONTAINMENT_UNVERIFIED',actorId:actor.actorId});
  journal.record('RECOVERY_RESULT',{result});return result;
}

export async function mainD(argv) {
  const modes=['--inspect','--execute-production','--resume-cleanup','--coordinate-input'];
  if(argv.length!==3||!modes.includes(argv[0])||argv[1]!=='--plan'||!path.isAbsolute(argv[2]))
    throw Error('USAGE: node scripts/qa/d-execution-entrypoint.mjs --inspect|--execute-production|--resume-cleanup|--coordinate-input --plan <absolute-private-plan.json>');
  const {loadDProductionRuntime,coordinateDPrivateInput}=await import('./d-execution-runtime.mjs');
  if(argv[0]==='--coordinate-input')return coordinateDPrivateInput(argv[2]);
  const runtime=await loadDProductionRuntime(argv[2],{inspect:argv[0]==='--inspect',resume:argv[0]==='--resume-cleanup'});
  if(argv[0]==='--inspect')return runtime;
  return runDExecution(runtime);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  mainD(process.argv.slice(2)).then(result=>{
    // Keys, aliases and raw receipts stay in the private execution directory.
    process.stdout.write(JSON.stringify({state:result.state??result.status,mode:result.mode??'INSPECT',
      assertions:result.assertions??{},residualCount:result.residuals?.length??0})+'\n');
    if(result.state==='BLOCKED'||result.status==='STOPPED'
      ||process.argv[2]==='--coordinate-input'&&result.status!=='LOCAL_NATIVE_EXIT')process.exitCode=1;
  }).catch(()=>{process.stderr.write('D_ENTRYPOINT_FAIL_CLOSED\n');process.exitCode=1;});
}
