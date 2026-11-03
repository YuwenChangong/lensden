import fs from 'node:fs';import {sha256} from './hash.mjs';
const privatePath='C:/Users/1/AppData/Local/OpenGlassHub/acceptance-input/e-verify-20261012/STATEFUL_PRIVATE_BINDING_WORKING.json';
const packetPath='C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json';
export function analyzeBudgetAndCases(scope){
 const bytes=fs.readFileSync(privatePath),privateInput=JSON.parse(bytes),packet=JSON.parse(fs.readFileSync(packetPath));
 const caps=privateInput.budget;
 if(JSON.stringify(caps)!==JSON.stringify(packet.ownerBudgets)||caps.openaiAndProviderCostUSDMax!==0)throw new Error('OWNER_BUDGET_CHANGED');
 const maxNav=21,maxAssetsPerNav=scope.manifest.length,backgroundUpper=5*maxNav+3;
 const conservativeGlobal=maxNav+maxAssetsPerNav*maxNav+backgroundUpper+caps.supabaseAuthDispatchesMax+caps.supabaseRestReadDispatchesMax+caps.turnstileHttpDispatchesMax+2;
 const values={allBrowserHttpDispatchesMax:[51,conservativeGlobal,'UNKNOWN','51 fixed runner reads/actions incl18 planned HTML; static/challenge/background/optional logout reload not zero. Upper is deliberately non-tight, not a request-budget increase.'],
  applicationMutationDispatchesMax:[9,15,'YES','6 password attempts,3 logout,up to6 refresh; all other mutations forbidden.'],
  supabaseAuthDispatchesMax:[12,18,'YES','6 login+3 explicit identity+3 logout; up to6 refresh. SDK in scoped sources uses getSession, not extra getUser.'],
  supabaseRestReadDispatchesMax:[19,19,'YES','16 frozen RLS cases plus3 private profile reads; SSR internal reads are not browser PostgREST dispatches.'],
  turnstileHttpDispatchesMax:[6,40,'UNKNOWN','6 loader opportunities; actual Managed challenge steps not predictable; hard cap40 is enforced, not guaranteed sufficient.'],
  ownerSessionRefreshRequestsMax:[0,6,'YES','Zero is a lower bound, not an assumption;6 shared maximum.'],
  executionSecondsMax:[null,1800,'UNKNOWN','Owner cap3600; supervisor hard1800/work1740/cleanup60. Manual6x300 waits cannot all exhaust and still complete; timeout safely stops.'],
  openaiAndProviderCostUSDMax:[0,0,'YES','Free proof reused; no paid Provider capability granted.']};
 const zero=['cleanupMutationDispatchesMax','supabaseRestWriteDispatchesMax','mailProducingSubmissionsMax','storageUploadOperationsMax','storageDeleteOperationsMax',
  'mediaRangeRequestsMax','mediaUploadBytesMax','mediaReadBytesMax','r2StoredBytesMax','openaiModerationCallsMax'];
 for(const k of zero)values[k]=[0,0,'YES','Excluded from GROUP_1; positive owner-wide ceiling does not authorize this operation.'];
 const rows=Object.entries(caps).map(([key,max])=>{const [required,worst,sufficient,note]=values[key]||[null,null,'UNKNOWN','No proved count'];return {
  budget:key,CURRENT_APPROVED_MAX:max,PROVEN_REQUIRED_COUNT:required,WORST_CASE_BOUNDED_COUNT:worst,
  RESERVED_MARGIN:worst===null?null:max-worst,SUFFICIENT:sufficient,note,
  admissionHardCap:max};});
 const byId=Object.fromEntries(JSON.parse(fs.readFileSync('C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/MANDATORY_ACCEPTANCE_MATRIX.json')).cases.map(x=>[x.id,x.case]));
 const actorsFor=id=>id==='AUTH-02'?['A']:id==='AUTH-03'?['B']:id==='AUTH-04'?['ADMIN']:id.startsWith('AUTH-08')?['A']:id==='RLS-01'?['anon']:['RLS-02','RLS-03'].includes(id)?['A','B']:['A','B','ADMIN'];
 const stagesFor=id=>id==='AUTH-01'?['LOGIN_A','LOGIN_B','LOGIN_ADMIN','NEGATIVE_CAPTCHA','NEGATIVE_MISSING_CAPTCHA']
  :id.startsWith('AUTH-08')?['NEGATIVE_PASSWORD']:id==='RLS-01'?['CATALOG_ANON_6']:['RLS-02','RLS-03'].includes(id)?['CATALOG_A_5','CATALOG_B_5']
  :id==='RLS-04'?['PRODUCT_DETAIL_A','PRODUCT_DETAIL_B','PRODUCT_DETAIL_ADMIN']:id==='RLS-05'||id.startsWith('ADMIN-04')?['ADMIN_API_A_B_DENIED','ADMIN_UI_A_B_DENIED','ADMIN_API_UI_ADMIN_ALLOWED']
  :id==='AUTH-02'?['LOGIN_A','SESSION_A','LOGOUT_A']:id==='AUTH-03'?['LOGIN_B','SESSION_B','LOGOUT_B']:id==='AUTH-04'?['LOGIN_ADMIN','ADMIN_IDENTITY','LOGOUT_ADMIN']:['LOGIN_A_B_ADMIN','PRODUCTS','PRODUCT_DETAIL','ADMIN_DEVICES_READ_ONLY'];
 const cases=packet.requiredCases.map(id=>({caseId:id,originalCase:byId[id.split(':')[0]],actors:actorsFor(id),
  executionStages:stagesFor(id),subsetResidual:'Only the original explicit scoped/partial mapping; no mail/recovery/all-admin-page or complete UI acceptance implied.',
  loginInitialHtml:'REUSED_PROTECTED_CAPTURE',loginStaticAssets:'VERIFIED23',positivePrerequisite:'/products/',
  htmlStages:packet.applicationPages,css:'Reviewed common2; products page CSS not captured',
  jsRoots:'Reviewed login23; products index/AdminDevices roots and dependencies pending',
  imports:'Literal import/modulepreload/hydration edges bound in finite source graph; Production unknown nodes not executable',
  background:['/api/users/me/summary','/api/users/me/preferences','/api/users/me/notifications?limit=8&unread_only=1','/api/admin/forum/me','/api/admin/devices'],
  budgetCategories:['allBrowserHttpDispatchesMax','supabaseAuthDispatchesMax','supabaseRestReadDispatchesMax','turnstileHttpDispatchesMax','ownerSessionRefreshRequestsMax'],
  evidence:'Existing frozen full runner + mandatory matrix + current scope + reviewed login evidence',
  fullExecutionEvidence:'BLOCKED',productionResult:'NOT_EXECUTED',reason:'Whole runner success prerequisites include unverified post-login page assets; partial case resources are not full acceptance.'}));
 return {budget:{format:'group1-budget-evidence-v1',privateBudgetMatchesFrozenPacket:true,privateBindingSha256:sha256(bytes),
  rows,requestBudget:'UNKNOWN',fixedStepLowerBound51:true,maxNavigationEpochs:maxNav,manifestUpperPerEpoch:maxAssetsPerNav,
  conservativeGlobalUpper:conservativeGlobal,globalHardAdmissionMax:caps.allBrowserHttpDispatchesMax,
  conservativeUpperIsNotAProvenMinimum:true,productionTrace:'NOT_EXECUTED',fullChromeMock:'BLOCKED_PENDING_PRODUCTION_RESOURCE_EVIDENCE',
  mediaFontsAndImages:'Excluded before dispatch, not hidden traffic',providerDeploymentGETMax:2,productionRequests:0},
  cases:{format:'group1-original14-resource-mapping-v1',caseCount:cases.length,casesWithFullExecutionEvidence:0,
   authenticatedRLSReads:packet.catalogRestRequests.length,cases,scopeUnaffected:true},ownerBudgets:caps,packet};
}
