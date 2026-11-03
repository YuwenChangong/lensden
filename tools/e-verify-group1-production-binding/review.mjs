import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha,stem,compareModules} from './semantic.mjs';
import {AssetReadPlan} from '../e-verify-group1-asset-reader-fresh-v8/dependency-policy.mjs';
import {readProtectedEvidence} from '../e-verify-group1-asset-reader-fresh-v8/private-evidence.mjs';

export const VERSION='b2b62ec9-bb8d-4159-ac99-08fca5740134';
export const SOURCE='88680a6eaab8de4123199f16b325ec0a430b0b86';
export const ORIGIN='https://openglasshub.ogh.workers.dev';
export const TARGET='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js';
const root=fileURLToPath(new URL('../e-verify-group1-asset-reader-fresh-v8/artifacts/',import.meta.url));
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const bindingPath=path.join(root,'EXECUTION_BINDING_ASSET_READER.json');
const bindingSha='036172b39d01ad036a5b3c2ec060f1c1d7752bc18d73d669a8049b2030554497';
const required=(ok,code)=>{if(!ok)throw new Error(code)};
const localePair={reviewedReactFactoryMove:true,
 actualSha256:'991ebf58bed99754cc2f4436bfafb830de70fb720a73897b1efa05fd3a32eb3c',
 localSha256:'7ef9768e2be3f702e430a9ede82666c6ffab59095f711438a7b82ba4087df8e9'};

// Offline only. Decrypted payloads remain in process memory, never returned in reports.
export async function reviewEvidence(){
 required(sha(fs.readFileSync(bindingPath))===bindingSha,'READER_BINDING_CHANGED');
 const binding=json(bindingPath);
 for(const f of binding.files)required(sha(fs.readFileSync(f.path))===f.sha256,'FROZEN_INPUT_CHANGED');
 const receiptPath=path.join(root,'ASSET_READ_EXECUTION_SAFE.json');
 const closure=json(path.join(root,'ASSET_READ_GO_CLOSURE_SAFE.json'));
 const receipt=json(receiptPath),packet=json(path.join(root,'ASSET_READ_PACKET_NOT_AUTHORIZED.json'));
 required(closure.childReceiptSha256===sha(fs.readFileSync(receiptPath))
  &&closure.supervisorReceiptSha256===sha(fs.readFileSync(path.join(root,'ASSET_READ_SUPERVISOR_SAFE.json')))
  &&closure.parentReceiptSha256===sha(fs.readFileSync(path.join(root,'ASSET_READ_FINAL_SAFE.json')))
  &&closure.status==='CONTENT_EVIDENCE_COLLECTED'&&closure.cleanup==='PASS_JOB_DRAIN_CLOSED'
  &&closure.authorizationConsumed===true&&closure.claimCreated===true,'RECEIPT_CHAIN_INVALID');
 required(receipt.status==='CONTENT_EVIDENCE_COLLECTED'&&receipt.firstFailure===null&&receipt.assets.length===23,'COLLECTION_NOT_COMPLETE');
 required(receipt.sourceCommit===SOURCE&&packet.sourceSha===SOURCE&&receipt.authDispatches===0&&receipt.rlsReads===0&&receipt.writes===0&&receipt.retries===0,'COLLECTION_IDENTITY');
 const pre=receipt.preDeployment,post=receipt.postDeployment;
 required(pre.activeVersion===VERSION&&post.activeVersion===VERSION&&pre.activeTraffic===100&&post.activeTraffic===100
  &&pre.deploymentId===post.deploymentId&&pre.recoveryTraffic===0&&post.recoveryTraffic===0,'DEPLOYMENT_DRIFT');
 const release=json(binding.releaseIdentityPath);
 required(release.build.id==='d98da799-d41d-41dc-acaf-8c6675fd799a'&&release.build.sourceSha===SOURCE
  &&release.build.version===VERSION&&release.build.build==='PASS'&&release.build.deploy==='PASS','SOURCE_BUILD_LINK');
 required(execFileSync('git',['rev-parse','HEAD'],{cwd:binding.sourceRoot,encoding:'utf8',windowsHide:true}).trim()===SOURCE,'SOURCE_CHECKOUT_DRIFT');
 const original=json('C:/Temp/ogh-a-deploy-readiness-20261010/artifact-manifest.json');
 required(original.candidateHead===SOURCE,'LOCAL_MANIFEST_SOURCE');
 const candidates=original.files.filter(f=>/^dist\/client\/_astro\/.*\.(js|css)$/.test(f.path));
 const byStem=new Map();
 for(const f of candidates){const p='/'+f.path.slice('dist/client/'.length),k=stem(p);byStem.set(k,[...(byStem.get(k)||[]),{...f,path:p}])}
 const known=new Set(byStem.keys());
 const read=row=>{
  const b=readProtectedEvidence(binding.privateEvidenceDirectory,binding.authorizationId,row.evidence.evidenceRef,row.evidence.ciphertextSha256);
  required(b.length===row.bytes&&sha(b)===row.sha256,'PROTECTED_CONTENT_MISMATCH');return b;
 };
 const html=read(receipt.html),bodies=new Map();
 const plan=new AssetReadPlan({origin:ORIGIN,manifest:packet.manifest,requiredTarget:TARGET});
 plan.observeHtml(html);
 const reviews=[];
 for(const a of receipt.assets){
  const body=read(a);bodies.set(a.path,body);
  plan.reserve(ORIGIN+a.path,'GET');
  if(a.kind==='script')await plan.observeScript(a.path,body);else plan.observeStylesheet(a.path,body);
  const choices=byStem.get(stem(a.path))||[];
  const local=choices.find(x=>x.path===a.path)||(choices.length===1?choices[0]:null);required(!!local,'NO_UNAMBIGUOUS_SOURCE_COUNTERPART');
  const frozen=fs.readFileSync(path.join(binding.sourceRoot,'dist/client',local.path));
  required(frozen.length===local.bytes&&sha(frozen)===local.sha256,'LOCAL_ARTIFACT_CHANGED');
  const reviewOptions=a.path==='/_astro/useLocale.OuxaUvmK.js'?localePair
   :['/_astro/HeaderUserMenu.BQjZAuvq.js','/_astro/HeaderNotifications.Dvp51m2w.js'].includes(a.path)?{reviewedImportOrder:true}:{};
  const proof=a.kind==='script'?compareModules(body,frozen,a.path,local.path,known,reviewOptions):{matches:body.equals(frozen),kind:'EXACT_FROZEN_BUILD_BYTES'};
  required(proof.matches,'SOURCE_REVIEW_MISMATCH');
  reviews.push({path:a.path,kind:a.kind,bytes:a.bytes,sha256:a.sha256,localPath:local.path,localSha256:local.sha256,
   provenance:'VERIFIED',sourceEvidence:proof,contentTypeEvidence:'FROZEN_READER_VALIDATED_ALLOWED_MIME_NOT_RAW_HEADER_CAPTURE',
   buildByteEquality:body.equals(frozen),version:VERSION,host:new URL(ORIGIN).host,method:'GET'});
 }
 required(plan.pending().length===0,'LITERAL_GRAPH_INCOMPLETE');
 const graph=plan.referenceGraph();
 required(JSON.stringify(graph.map(x=>[x.path,[...x.parents].sort()]).sort())===JSON.stringify(receipt.referenceGraph.map(x=>[x.path,[...x.parents].sort()]).sort()),'REFERENCE_GRAPH_CHANGED');
 const target=reviews.find(x=>x.path===TARGET);
 required(target?.bytes===1168&&target.sha256==='d38ccb187c70064b9bec7e27993090ade0408ca524cccef2aec7312521240902','TARGET_IDENTITY');
 const admin=byStem.get('/_astro/AdminDevicesDashboard.js')?.[0];
 required(!!admin&&!bodies.has(admin.path),'ADMIN_COVERAGE_REASSESS_REQUIRED');
 const safe={format:'group1-production-asset-offline-review-v1',status:'LOGIN_ASSETS_VERIFIED_FULL_FLOW_BLOCKED',
  source:SOURCE,version:VERSION,readerBindingSha256:bindingSha,receiptSha256:sha(fs.readFileSync(receiptPath)),
  protectedFilesVerified:24,frozenInputsVerified:binding.files.length,
  prePostDeployment:'PASS',sourceBuildVersionLink:'EXISTING_TRUSTED_RELEASE_RECEIPT',
  exactFrozenAssetBytes:reviews.filter(x=>x.buildByteEquality).length,scopedSourceStructuralReviews:reviews.filter(x=>!x.buildByteEquality).length,
  semanticProofBoundary:'AST review of these exact pairs, not general equivalence or Cloud build reproducibility',
  historicalBuildEnvironmentParity:'UNKNOWN',literalLoginGraph:'CLOSED',runtimeOrOtherPagesGraph:'NOT_PROVEN',assets:reviews,graph,
  targetSourceReview:{sourceFile:'src/components/site/SiteHeader.astro',
   behavior:'Settings navigation guard and DOM menu/dialog/keyboard handlers; no direct fetch, Auth submission or moderation call.',
   dependency:'SettingsPage reviewed from actual captured bytes; not a request to execute settings mutations.'},
  localeInitializerReview:{sourceFiles:['src/components/i18n/useLocale.ts','src/lib/i18n/catalog.ts','src/lib/i18n/locale-store.ts'],
   boundary:'Only this pinned byte pair. Lazy React namespace initialization changes placement relative to catalog data/functions. No general instruction-order normalization is authorized.'},
  importOrderReview:{sourceFiles:['src/components/site/HeaderUserMenu.tsx','src/components/site/HeaderNotifications.tsx'],
   boundary:'Only two pinned byte pairs. Identical imported exports and reviewed dependency graph; React, locale data and lazy browser Auth state do not depend on sibling import order. Not a general import-order equivalence rule.'},
  fullGroup1Blocker:{code:'POST_LOGIN_ASSET_PROVENANCE_NOT_CAPTURED',sourceFile:'src/pages/admin/devices/index.astro',
   knownLocalComponent:admin.path,actualProductionComponentPath:'UNKNOWN',
   reason:'AdminDevicesDashboard client:load is outside the acquired login HTML/23-resource graph; do not authorize its local hash as Production proof.',
   otherKnownUncapturedRoots:[{sourceFile:'src/pages/products/index.astro',localPath:'/_astro/index.astro_astro_type_script_index_0_lang.BskClGKx.js',
    dependency:'/_astro/catalog-compare-dom.tKlnu0X0.js',productionPaths:'UNKNOWN'},{sourceFile:'src/components/admin/AdminDevicesDashboard.tsx',
    dependency:'/_astro/useAdminSession.B8o2Cihd.js',productionPaths:'UNKNOWN'}]},
  ownerBudgetsUnchanged:true,authProductionResult:'NOT_EXECUTED',rlsProductionResult:'0/16',
  productionRequestsThisReview:0,productionWritesThisReview:0,oldAuthorizationReused:false,catalogHold:'ACTIVE'};
 return {safe,html,bodies,closure};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const {safe}=await reviewEvidence();console.log(JSON.stringify({status:safe.status,protectedFilesVerified:safe.protectedFilesVerified,
  exact:safe.exactFrozenAssetBytes,reviewed:safe.scopedSourceStructuralReviews,frozenFiles:safe.frozenInputsVerified,blocker:safe.fullGroup1Blocker.code}));}
 catch(e){console.log(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OFFLINE_REVIEW_FAILED'}));process.exitCode=1}
}
