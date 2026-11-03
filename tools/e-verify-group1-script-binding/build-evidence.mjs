import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scriptPathFingerprint} from './execution/group1/path-fingerprint.mjs';

export const buildRoot='C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub';
export const manifestPath='C:/Temp/ogh-a-deploy-readiness-20261010/artifact-manifest.json';
export const priorRoot='C:/Temp/ogh-product-beta-development-20261013/tools/e-verify-group1-login-diagnostics/execution/group1/artifacts';
export const releaseReceiptPath='C:/Temp/ogh-a-deploy-readiness-20261010/final-recovery151-authorization/A_DEPLOY_FINAL_SMOKE_CLOSURE_RESUMED_SAFE.json';
export const releaseIdentityPath='C:/Temp/ogh-a-deploy-readiness-20261010/final-recovery151-authorization/A_DEPLOY_READ_ONLY_ACCEPTANCE_FINAL_SAFE.json';
const require=createRequire(buildRoot+'/package.json');
const lexer=require('es-module-lexer');
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=file=>JSON.parse(fs.readFileSync(file));
const ensure=(ok,code)=>{if(!ok)throw new Error(code)};

export async function inspectBuild({scriptPathSha256=null}={}){
  const packet=load(path.join(priorRoot,'GROUP1_PACKET_NOT_AUTHORIZED.json'));
  const binding=load(path.join(priorRoot,'EXECUTION_BINDING_GROUP1.json'));
  const manifest=load(manifestPath),release=load(releaseReceiptPath),identity=load(releaseIdentityPath);
  const historical=load(path.join(priorRoot,'GROUP1_EXECUTION_SAFE.json'));
  const manifestBinding=binding.files.find(x=>path.resolve(x.path)===path.resolve(manifestPath));
  ensure(manifestBinding&&sha256(fs.readFileSync(manifestPath))===manifestBinding.sha256,'LOCAL_MANIFEST_BINDING_DRIFT');
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:buildRoot,encoding:'utf8',windowsHide:true,timeout:5000}).trim();
  ensure(head===packet.sourceSha&&manifest.candidateHead===packet.sourceSha,'BUILD_SOURCE_DRIFT');
  ensure(release.aDeploy==='PASS'&&release.buildSourceSha===packet.sourceSha&&release.expectedVersion===packet.expectedProductionVersion,'RELEASE_IDENTITY_DRIFT');
  ensure(identity.build.sourceSha===packet.sourceSha&&identity.build.version===packet.expectedProductionVersion&&identity.build.id===release.buildId,'BUILD_LINK_DRIFT');
  ensure(historical.preDeployment.activeVersion===packet.expectedProductionVersion&&historical.preDeployment.activeTraffic===100,'HISTORICAL_TARGET_DRIFT');
  const local=manifest.files.filter(x=>/^dist\/client\/_astro\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(x.path));
  const entries=local.map(x=>({path:x.path.slice('dist/client'.length),bytes:x.bytes,sha256:x.sha256}));
  const known=new Map(entries.map(x=>[x.path,x]));
  ensure(known.size===entries.length,'DUPLICATE_LOCAL_ASSET');
  const packetPaths=new Set(packet.staticManifest.map(x=>x.path));
  await lexer.init;
  const edges=[],nonliteralImports=[],missingLiteralImports=[];
  for(const item of local){
    const bytes=fs.readFileSync(path.join(buildRoot,item.path));
    ensure(bytes.length===item.bytes&&sha256(bytes)===item.sha256,'LOCAL_BUILD_BYTES_DRIFT');
    const route=item.path.slice('dist/client'.length);
    const bound=packet.staticManifest.find(x=>x.path===route);
    ensure(!bound||bound.bytes===item.bytes&&bound.sha256===item.sha256,'STATIC_BINDING_BYTE_DRIFT');
    if(!route.endsWith('.js'))continue;
    const [imports]=lexer.parse(bytes.toString('utf8'));
    for(const ref of imports){
      if(ref.d===-2)continue; // import.meta is not an HTTP import.
      if(typeof ref.n!=='string'){nonliteralImports.push({from:route,kind:'NON_LITERAL_IMPORT_NOT_PROVEN'});continue}
      const target=new URL(ref.n,'https://local-build.invalid'+route);
      if(target.origin!=='https://local-build.invalid'||target.search||target.hash||!known.has(target.pathname))
        missingLiteralImports.push({from:route,dependency:'UNBOUND_LITERAL_IMPORT'});
      else edges.push({from:route,to:target.pathname,dynamic:ref.d>=0});
    }
  }
  const serverInputs=['dist/server/chunks/index_D-DJcjRt.mjs','dist/server/chunks/entrypoints_BIiJaWEe.mjs'];
  for(const name of serverInputs){const item=manifest.files.find(x=>x.path===name);ensure(item&&sha256(fs.readFileSync(path.join(buildRoot,name)))===item.sha256,'LOCAL_SSR_BUILD_DRIFT')}
  ensure(scriptPathSha256===null||/^[a-f0-9]{64}$/.test(scriptPathSha256),'INVALID_PATH_FINGERPRINT');
  return {format:'group1-script-local-evidence-v1',sourceSha:packet.sourceSha,expectedProductionVersion:packet.expectedProductionVersion,
    buildId:release.buildId,buildToSourceAndVersion:'EXISTING_VERIFIED_RECEIPTS',localStaticFilesVerified:entries.length,
    localManifestSha256:sha256(fs.readFileSync(manifestPath)),serverInputs,
    missingLocalStaticBindings:entries.filter(x=>!packetPaths.has(x.path)).map(x=>x.path),
    literalDependencyEdges:edges.length,edges,nonliteralImports,missingLiteralImports,
    fingerprintIndex:entries.filter(x=>x.path.endsWith('.js')).map(x=>({path:x.path,scriptPathSha256:scriptPathFingerprint(x.path),bytes:x.bytes,sha256:x.sha256})),
    fingerprintMatches:scriptPathSha256===null?[]:entries.filter(x=>scriptPathFingerprint(x.path)===scriptPathSha256).map(x=>x.path),
    historicalNormalizedRoute:historical.diagnostics.firstRejection.normalizedRoute,
    historicalRejectedScript:'UNKNOWN',historicalFingerprintPresent:typeof historical.diagnostics.firstRejection.scriptPathSha256==='string',
    deployedBuildByteMatch:'UNKNOWN',missingEvidence:'EXACT_REJECTED_SCRIPT_PATHNAME_FINGERPRINT_OR_DEPLOYED_SCRIPT_MANIFEST',
    fullGroup1RetryReady:false,productionRequests:0,productionWrites:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=await inspectBuild();
  console.log(JSON.stringify({sourceSha:r.sourceSha,expectedProductionVersion:r.expectedProductionVersion,localStaticFilesVerified:r.localStaticFilesVerified,
    missingLocalStaticBindings:r.missingLocalStaticBindings,missingLiteralImports:r.missingLiteralImports,nonliteralImports:r.nonliteralImports,
    literalDependencyEdges:r.literalDependencyEdges,deployedBuildByteMatch:r.deployedBuildByteMatch,historicalRejectedScript:r.historicalRejectedScript,productionRequests:0}));
}
