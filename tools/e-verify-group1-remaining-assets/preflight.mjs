import fs from 'node:fs';import path from 'node:path';
import {validateAuthorization,verifyFiles} from './authorization.mjs';import {sha256} from './hash.mjs';
import {assertRuntime,checkOAuth} from '../e-verify-group1-asset-reader-fresh-v8/preflight.mjs';
export {checkOAuth};
export const ID='e-verify-group1-openglasshub-20261013-remaining-assets-v9';
export const PAGES=Object.freeze(['/products/','/products/xreal/xreal-air/','/admin/devices/']);
export const MARKERS=Object.freeze({'/products/':['data-brand-module'],'/products/xreal/xreal-air/':['data-product-detail'],'/admin/devices/':['AdminDevicesDashboard.']});
export const CAPS=Object.freeze({totalGETMax:12,htmlGETMax:3,assetGETMax:7,providerDeploymentGETMax:2,concurrencyMax:4,
 hardSeconds:300,workSeconds:240,cleanupReserveSeconds:60,perRequestSeconds:15,maxHeaderBytes:8192,maxAssetBytes:2097152,anonymousAggregateBytesMax:16777216});
export function assertPacket(p){
 if(p.authorizationId!==ID||p.readerPolicyVersion!=='STRICT_MODULE_PARSE_V2'||p.htmlReferencePolicy!=='REJECT_BASE_CASE_INSENSITIVE_TOKENS_AND_CSS_IMPORTS'||p.sourceSha!=='88680a6eaab8de4123199f16b325ec0a430b0b86'
  ||p.expectedProductionVersion!=='b2b62ec9-bb8d-4159-ac99-08fca5740134'||p.buildId!=='d98da799-d41d-41dc-acaf-8c6675fd799a'
  ||p.accountId!=='dcb374166b39234a499985145c075f50'||p.worker!=='openglasshub'||p.appOrigin!=='https://openglasshub.ogh.workers.dev'
  ||JSON.stringify(p.pages)!==JSON.stringify(PAGES)||JSON.stringify(p.proposedReadBudgets)!==JSON.stringify(CAPS)
  ||JSON.stringify(p.htmlRequiredMarkers)!==JSON.stringify(MARKERS)
  ||p.fixedRequests?.length!==4||p.fixedRequests[0].url!=='https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/workers/scripts/openglasshub/deployments'
  ||p.fixedRequests.slice(1).some((x,i)=>x.url!==p.appOrigin+PAGES[i]||x.method!=='GET')||p.fixedRequests[0].method!=='GET'
  ||p.executionLimitSeconds!==300||p.workLimitSeconds!==240||p.cleanupReserveSeconds!==60
  ||p.manifest?.length!==30||p.reusedAssets?.length!==23||p.remainingSlots?.length!==7
  ||p.scopeSha256!==sha256(Buffer.from(JSON.stringify({manifest:p.manifest,edgeRules:p.edgeRules,requiredRoots:p.requiredRoots})))
  ||p.zeroCostPolicy?.MAX_ADDITIONAL_COST_USD!==0||p.zeroCostPolicy.PAID_USAGE_AUTHORIZED!==false
  ||p.authDispatchMax!==0||p.rlsReadsMax!==0||p.productionWritesMax!==0||p.thirdPartyHTTPMax!==0||p.retries!==0||p.redirectFollowing!==0
  ||p.fullGroup1Authorized!==false||p.group2Authorized!==false||p.group3Authorized!==false||p.catalogHold!=='ACTIVE')throw new Error('REMAINING_READER_PACKET_INVALID');
 return true;
}
export function validateLocal({auth,packet,packetBytes,binding,bindingBytes,go,now,claimExists}){
 assertPacket(packet);validateAuthorization(auth,{packet,packetSha256:sha256(packetBytes),bindingSha256:sha256(bindingBytes),go,now,claimExists});
 if(binding.authorizationId!==ID||binding.packetSha256!==sha256(packetBytes)||binding.privateEvidenceDirectory!==path.join(process.env.LOCALAPPDATA,'OpenGlassHub','asset-evidence',ID))throw new Error('INSTANCE_BINDING_INVALID');
 assertRuntime(binding);verifyFiles(binding.files);
 const proofBytes=fs.readFileSync(binding.freeEvidencePath),proof=JSON.parse(proofBytes);
 if(sha256(proofBytes)!==packet.existingFreeProofSha256||proof.ownerEvidence!=='OWNER_ATTESTED'||proof.providerEvidence!=='PROVIDER_DOCUMENTED'
  ||proof.policy?.MAX_ADDITIONAL_COST_USD!==0||proof.services?.[0]?.plan!=='Free'||proof.services[0].paidAddons!=='None'
  ||proof.services?.[1]?.plan!=='Free'||proof.services[1].paidAddons!=='None')throw new Error('FREE_EVIDENCE_DRIFT');
 const release=JSON.parse(fs.readFileSync(binding.releaseIdentityPath));
 if(release.build?.sourceSha!==packet.sourceSha||release.build.version!==packet.expectedProductionVersion||release.build.id!==packet.buildId)throw new Error('SOURCE_VERSION_LINK_DRIFT');
 return true;
}
