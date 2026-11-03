import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {ID,GO,validateAuthorization,verifyFiles} from './authorization.mjs';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
import {assertFreePlan,scopeDigest} from 'file:///C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/free-plan-policy.mjs';
import {catalogSteps} from '../e-verify-group1-script-identity/execution/group1/rls.mjs';
import {requiredCases,validatePrivateBinding} from '../e-verify-group1-script-identity/execution/group1/runner.mjs';
const root=fileURLToPath(new URL('./artifacts/',import.meta.url));
export function checkOAuth(c,now){
 if(typeof c?.oauth_token!=='string'||!c.oauth_token)throw new Error('OAUTH_TOKEN_ABSENT');
 if(!Array.isArray(c.scopes)||!['account:read','workers_scripts:write'].every(s=>c.scopes.includes(s)))throw new Error('OAUTH_SCOPES');
 const end=Date.parse(c.expiration_time);if(!Number.isFinite(end)||end<=now+1860000)throw new Error('OAUTH_COVERAGE');return true;
}
export function loadDefaultOAuth(){const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');return req('smol-toml').parse(fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'))}
export function assertPacket(p,b){
 if(p.authorizationId!==ID||p.sourceSha!=='88680a6eaab8de4123199f16b325ec0a430b0b86'||p.expectedProductionVersion!=='b2b62ec9-bb8d-4159-ac99-08fca5740134'
   ||p.appOrigin!=='https://openglasshub.ogh.workers.dev'||p.supabaseOrigin!=='https://xcbnxzjlsvtgzixurcof.supabase.co'
   ||p.ownerBudgets?.allBrowserHttpDispatchesMax!==650||p.ownerBudgets.openaiAndProviderCostUSDMax!==0
   ||p.providerDeploymentGetMax!==2||p.executionLimitSeconds!==1800||p.workLimitSeconds!==1740||p.cleanupReserveSeconds!==60||p.oauthRemainingSecondsStrictlyGreaterThan!==1860
   ||JSON.stringify(p.requiredCases)!==JSON.stringify(requiredCases)||JSON.stringify(p.catalogRestRequests)!==JSON.stringify(catalogSteps())
   ||p.staticManifest?.length!==29||new Set(p.staticManifest.map(a=>a.path)).size!==29||p.staticManifest.some(a=>a.provenance!=='VERIFIED'||a.version!==p.expectedProductionVersion)
   ||p.productionAuthorization!=='NOT_AUTHORIZED'||p.catalogHold!=='ACTIVE'||p.fullEVerify!=='INCOMPLETE'||p.publicBetaGo!=='NOT_AUTHORIZED'
   ||b.authorizationId!==ID||b.privateBindingPath!==path.join(process.env.LOCALAPPDATA,'OpenGlassHub','acceptance-input','e-verify-20261012','STATEFUL_PRIVATE_BINDING_GROUP1_650_V1.json'))throw new Error('FULL_GROUP1_PACKET_INVALID');
 const source=JSON.parse(fs.readFileSync('C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json'));
 for(const key of ['accountId','worker','approvalBoundary','actors','loginActions','applicationPages','pageContentAssertions','ownBackgroundGet','adminGet','authPaths','dynamicPrivateProfileGet','turnstileCapability','excluded','sideEffects','serverModerationDependency','mutationResultAmbiguity','recoveryBoundary'])
   if(JSON.stringify(p[key])!==JSON.stringify(source[key]))throw new Error('ORIGINAL_SCOPE_CHANGED');
 for(const key of new Set([...Object.keys(p.ownerBudgets),...Object.keys(source.ownerBudgets)]))if(key!=='allBrowserHttpDispatchesMax'&&p.ownerBudgets[key]!==source.ownerBudgets[key])throw new Error('CLASS_BUDGET_CHANGED');
 if(p.freePlanScopeSha256!==scopeDigest(p))throw new Error('FREE_SCOPE_DIGEST');
 const proof=fs.readFileSync(root+'OWNER_FREE_PLAN_EVIDENCE.json');assertFreePlan(p,JSON.parse(proof),proof);return true;
}
export function readPrivateVersion(b,p){const bytes=fs.readFileSync(b.privateBindingPath);if(sha(bytes)!==b.privateBindingSha256)throw new Error('PRIVATE_VERSION_DRIFT');const v=JSON.parse(bytes);
 if(JSON.stringify(v.budget)!==JSON.stringify(p.ownerBudgets)||v.candidateHead!==p.sourceSha||v.productionVersion!==p.expectedProductionVersion)throw new Error('PRIVATE_SCOPE_DRIFT');
 validatePrivateBinding(v);return v;
}
export function validateLocal({auth,packet,binding,packetBytes,bindingBytes,go,now,claimExists}){
 validateAuthorization(auth,{packet,packetSha256:sha(packetBytes),bindingSha256:sha(bindingBytes),go,now,claimExists});assertPacket(packet,binding);verifyFiles(binding.files);
 if(path.resolve(binding.nodePath).toLowerCase()!==path.resolve(process.execPath).toLowerCase())throw new Error('NODE_RUNTIME_DRIFT');
 readPrivateVersion(binding,packet);return true;
}
export {GO};
