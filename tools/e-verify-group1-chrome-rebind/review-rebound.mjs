import {verifyHistoricalFiles} from './chrome-identity.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha,stem,compareModules} from '../e-verify-group1-production-binding/semantic.mjs';
import {loadReuse} from '../e-verify-group1-remaining-assets/reuse.mjs';
import {readProtectedEvidence} from '../e-verify-group1-remaining-assets/private-evidence.mjs';
import {AssetReadPlan} from '../e-verify-group1-remaining-assets/dependency-policy.mjs';
import {buildScope,SOURCE_ROOT} from '../e-verify-group1-remaining-assets/scope.mjs';
import {compareNewModule} from '../e-verify-group1-v9-closure/semantic.mjs';

export const ORIGIN='https://openglasshub.ogh.workers.dev';
export const VERSION='b2b62ec9-bb8d-4159-ac99-08fca5740134';
export const SOURCE='88680a6eaab8de4123199f16b325ec0a430b0b86';
const root=fileURLToPath(new URL('../e-verify-group1-remaining-assets/artifacts/',import.meta.url));
const req=createRequire(SOURCE_ROOT+'/package.json'),parse=req('parse5').parse,parser=req('@babel/parser'),traverse=req('@babel/traverse').default;
const requireThat=(ok,code)=>{if(!ok)throw new Error(code)};
const json=p=>JSON.parse(fs.readFileSync(p));
export function inlineScripts(bytes){
  const result=[],stack=[parse(bytes.toString('utf8'))];
  while(stack.length){const n=stack.pop(),a=Object.fromEntries((n.attrs||[]).map(x=>[x.name,x.value]));
    if(n.tagName==='script'&&!a.src&&(!a.type||['module','text/javascript','application/javascript'].includes(a.type.toLowerCase())))
      result.push(Buffer.from((n.childNodes||[]).map(x=>x.value||'').join('')));
    stack.push(...(n.childNodes||[]));
  }
  return result;
}
let cached;
export function reviewV9(){return cached??=(async()=>{
  const bb=fs.readFileSync(root+'EXECUTION_BINDING_ASSET_READER.json'),pb=fs.readFileSync(root+'ASSET_READ_PACKET_NOT_AUTHORIZED.json');
  requireThat(sha(bb)==='29bb114ac2fc74d8509d2178658c5ad8afe50a420ff15d9a13c133c7b4e104bd'
    &&sha(pb)==='59b84fcafd3eba9250d2239a2cff9a9b777e79931df971eba532b865a2191eeb','V9_BINDING_DRIFT');
  const b=JSON.parse(bb),p=JSON.parse(pb),receipt=json(root+'ASSET_READ_EXECUTION_SAFE.json'),parent=json(root+'ASSET_READ_FINAL_SAFE.json'),supervisor=json(root+'ASSET_READ_SUPERVISOR_SAFE.json');
  verifyHistoricalFiles(b.files,'V9_FROZEN_FILE_DRIFT');
  requireThat(sha(fs.readFileSync(root+'ASSET_READ_EXECUTION_SAFE.json'))==='6c55ac8c096f54596513fceea405349fa3b942c589ac40abad6ffb6adac81fa6','V9_RECEIPT_CHANGED');
  requireThat(receipt.status==='CONTENT_EVIDENCE_COLLECTED'&&!receipt.firstFailure&&receipt.counts.total===11&&receipt.newAssets.length===6&&receipt.html.length===3
    &&receipt.authDispatches===0&&receipt.rlsReads===0&&receipt.writes===0&&receipt.retries===0&&receipt.literalDependencyGraphClosed===true,'V9_COLLECTION_INCOMPLETE');
  requireThat(parent.status==='CHILD_COMPLETED'&&parent.authorizationConsumed&&parent.claimCreated&&supervisor.classification==='EXIT_ZERO'
    &&supervisor.containment.closed&&supervisor.reaped&&!supervisor.receiptMissing,'V9_CLEANUP_NOT_PROVEN');
  for(const d of [receipt.preDeployment,receipt.postDeployment])requireThat(d.activeVersion===VERSION&&d.activeTraffic===100&&d.recoveryTraffic===0&&d.deploymentId===p.expectedPreviousDeploymentId,'V9_DEPLOYMENT_DRIFT');
  const release=json(b.releaseIdentityPath);
  requireThat(release.build.sourceSha===SOURCE&&release.build.version===VERSION&&release.build.id===p.buildId&&receipt.sourceCommit===SOURCE,'V9_RELEASE_LINK');
  requireThat(execFileSync('git',['rev-parse','HEAD'],{cwd:b.sourceRoot,encoding:'utf8',windowsHide:true}).trim()===SOURCE,'SOURCE_CHECKOUT_DRIFT');
  const reuse=loadReuse(),bodies=new Map(reuse.assets.map(a=>[a.path,a.body])),html=new Map([['/login/',reuse.html]]);
  const read=row=>{const bytes=readProtectedEvidence(b.privateEvidenceDirectory,b.authorizationId,row.evidence.evidenceRef,row.evidence.ciphertextSha256);
    requireThat(bytes.length===row.bytes&&sha(bytes)===row.sha256,'V9_CAPTURE_CHANGED');return bytes};
  for(const row of receipt.html)html.set(row.path,read(row));
  for(const row of receipt.newAssets)bodies.set(row.path,read(row));
  const scope=buildScope(),known=new Set(scope.manifest.map(a=>stem(a.path)));
  const frozen=json('C:/Temp/ogh-a-deploy-readiness-20261010/artifact-manifest.json');
  const counterpart=route=>frozen.files.filter(f=>f.path.startsWith('dist/client/_astro/')&&stem('/'+f.path.slice(12))===stem(route));
  const reviews=[];
  for(const row of receipt.newAssets){
    const choices=counterpart(row.path),f=choices.find(x=>x.path==='dist/client'+row.path)||(choices.length===1?choices[0]:null);
    requireThat(f,'SOURCE_COUNTERPART_AMBIGUOUS');
    const localPath='/'+f.path.slice('dist/client/'.length),local=fs.readFileSync(path.join(b.sourceRoot,f.path));
    requireThat(local.length===f.bytes&&sha(local)===f.sha256,'FROZEN_SOURCE_ARTIFACT_DRIFT');
    const body=bodies.get(row.path),proof=row.kind==='script'?compareNewModule(body,local,row.path,localPath,known):{matches:body.equals(local),kind:'EXACT_FROZEN_BUILD_BYTES'};
    requireThat(proof.matches,'NEW_ASSET_SOURCE_REVIEW_FAILED');
    reviews.push({...row,evidence:undefined,provenance:'VERIFIED',sourceVerified:true,sourceEvidence:proof,localPath,localSha256:f.sha256,
      buildByteEquality:body.equals(local),version:VERSION,host:new URL(ORIGIN).host,method:'GET'});
  }
  const prior=json(fileURLToPath(new URL('../e-verify-group1-production-binding/artifacts/PRODUCTION_RESOURCE_REVIEW_SAFE.json',import.meta.url)));
  const assets=[...prior.assets,...reviews];
  const plan=new AssetReadPlan({origin:ORIGIN,manifest:p.manifest,requiredTarget:p.requiredTarget,edgeRules:p.edgeRules});
  for(const [page,body]of html)plan.observeHtml(body,page);
  while(plan.pending().length){for(const route of plan.pending()){
    const row=assets.find(a=>a.path===route);requireThat(row&&bodies.has(route),'UNREVIEWED_DEPENDENCY');
    plan.reserve(ORIGIN+route,'GET');if(row.kind==='script')await plan.observeScript(route,bodies.get(route));else plan.observeStylesheet(route,bodies.get(route));
  }}
  const graph=plan.referenceGraph(),canonical=g=>JSON.stringify(g.map(a=>[a.path,a.kind,[...a.parents].sort()]).sort());
  requireThat(canonical(graph)===canonical(receipt.referenceGraph),'V9_REFERENCE_GRAPH_CHANGED');
  const server=parser.parse(fs.readFileSync(scope.inlineContingency.compiledSource,'utf8'),{sourceType:'module'});let detail;
  traverse(server,{StringLiteral(q){if(q.node.value.endsWith('/src/components/products/ProductDetail.astro?astro&type=script&index=0&lang.ts')&&q.parent.type==='ArrayExpression')detail=Buffer.from(q.parent.elements[1].value)}});
  requireThat(detail&&sha(detail)===scope.inlineContingency.sha256&&inlineScripts(html.get('/products/xreal/xreal-air/')).some(s=>s.equals(detail)),'DETAIL_INLINE_SOURCE_MISMATCH');
  // Existing login inline payloads plus the source-pinned detail script form a finite review set.
  const reviewedInline=new Set(inlineScripts(reuse.html).map(sha));reviewedInline.add(sha(detail));
  const inlineReview=[];
  for(const [page,bytes]of html){for(const script of inlineScripts(bytes)){
    requireThat(reviewedInline.has(sha(script)),'UNREVIEWED_INLINE_SCRIPT');
    inlineReview.push({page,sha256:sha(script),bytes:script.length,proof:script.equals(detail)?'EXACT_FROZEN_DETAIL_SCRIPT':'EXACT_PREVIOUS_LOGIN_INLINE_BYTES'});
  }}
  return {bodies,html,detail,safe:{format:'group1-v9-offline-closure-review-v1',source:SOURCE,version:VERSION,v9ProtectedFiles:9,reusedProtectedAssets:23,
    v9ReceiptSha256:sha(fs.readFileSync(root+'ASSET_READ_EXECUTION_SAFE.json')),sourceBuildLink:'EXISTING_FROZEN_RELEASE_RECEIPT_NOT_DEPLOYMENT_SHA',
    newAssets:reviews,assets,graph,literalGraph:'CLOSED',inlineReview,productDetailInline:'EXACT_FROZEN_COMPILED_BYTES',
    buildEnvironmentParity:'UNKNOWN',runtimeBranches:'NOT_PRODUCTION_VERIFIED',productionRequests:0,productionWrites:0,catalogHold:'ACTIVE'}};
})();}
