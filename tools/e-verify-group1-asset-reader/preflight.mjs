import fs from 'node:fs';import path from 'node:path';import {validateAuthorization,verifyFiles} from './authorization.mjs';import {sha256} from './hash.mjs';
export function assertPacket(p){
 const b=p.proposedReadBudgets;
 if(p.sourceSha!=='88680a6eaab8de4123199f16b325ec0a430b0b86'||p.expectedProductionVersion!=='b2b62ec9-bb8d-4159-ac99-08fca5740134'
   ||p.accountId!=='dcb374166b39234a499985145c075f50'||p.worker!=='openglasshub'||p.appOrigin!=='https://openglasshub.ogh.workers.dev'
   ||p.executionLimitSeconds!==300||p.workLimitSeconds!==240||p.cleanupReserveSeconds!==60||p.zeroCostPolicy?.MAX_ADDITIONAL_COST_USD!==0||p.zeroCostPolicy?.PAID_USAGE_AUTHORIZED!==false
   ||p.fullGroup1Authorized!==false||p.group2Authorized!==false||p.group3Authorized!==false||p.catalogHold!=='ACTIVE'
   ||JSON.stringify(b)!==JSON.stringify({totalGETMax:70,htmlGETMax:1,assetGETMax:67,providerDeploymentGETMax:2,concurrencyMax:4,hardSeconds:300,workSeconds:240,cleanupReserveSeconds:60,perRequestSeconds:15,maxHeaderBytes:8192,maxAssetBytes:2097152,anonymousAggregateBytesMax:16777216})
   ||p.authDispatchMax!==0||p.rlsReadsMax!==0||p.productionWritesMax!==0||p.thirdPartyHTTPMax!==0||p.retries!==0||p.redirectFollowing!==0
   ||p.manifest?.length!==67||sha256(Buffer.from(JSON.stringify(p.manifest)))!=='c9e4797d610f19da43c3570661ee3d29fe2984ff5bdb2997f1d5fc8207469320'
   ||p.authorizationId!=='e-verify-group1-openglasshub-20261013-production-asset-reader-v7'
   ||p.requiredTarget!=='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js'
   ||p.fixedRequests?.length!==3
   ||p.fixedRequests[0].url!=='https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/workers/scripts/openglasshub/deployments'
   ||p.fixedRequests[1].url!=='https://openglasshub.ogh.workers.dev/login/?next=%2Fproducts%2F'
   ||p.fixedRequests[2].url!==p.appOrigin+p.requiredTarget||p.fixedRequests.some(r=>r.method!=='GET'))throw new Error('ASSET_READER_PACKET_INVALID');
 return true;
}
export function validateLocal({auth,packet,packetBytes,binding,bindingBytes,go,now,claimExists}){
 assertPacket(packet);validateAuthorization(auth,{packet,packetSha256:sha256(packetBytes),bindingSha256:sha256(bindingBytes),go,now,claimExists});assertRuntime(binding);verifyFiles(binding.files);
 const proofBytes=fs.readFileSync(binding.freeEvidencePath),proof=JSON.parse(proofBytes);
 if(sha256(proofBytes)!==packet.existingFreeProofSha256||proof.ownerEvidence!=='OWNER_ATTESTED'||proof.providerEvidence!=='PROVIDER_DOCUMENTED'
   ||proof.policy?.MAX_ADDITIONAL_COST_USD!==0||proof.services?.[0]?.plan!=='Free'||proof.services[0].paidAddons!=='None')throw new Error('FREE_EVIDENCE_DRIFT');
 const source=JSON.parse(fs.readFileSync(binding.releaseIdentityPath));
 if(source.build?.sourceSha!==packet.sourceSha||source.build.version!==packet.expectedProductionVersion||source.build.id!==packet.buildId)throw new Error('BUILD_SOURCE_LINK_DRIFT');
 return true;
}
export function assertRuntime(binding){
 const equal=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
 if(typeof binding.nodePath!=='string'||!equal(binding.nodePath,process.execPath)||!binding.files.some(f=>equal(f.path,process.execPath)&&f.sha256===sha256(fs.readFileSync(process.execPath))))throw new Error('NODE_RUNTIME_DRIFT');return true;
}
export function checkOAuth(c,now){
 if(typeof c?.oauth_token!=='string'||!c.oauth_token)throw new Error('OAUTH_TOKEN_ABSENT');
 if(!Array.isArray(c.scopes)||!c.scopes.includes('workers_scripts:write')||!c.scopes.includes('account:read'))throw new Error('OAUTH_SCOPES');
 const end=Date.parse(c.expiration_time);if(!Number.isFinite(end)||end<=now+360000)throw new Error('OAUTH_COVERAGE');return true;
}
