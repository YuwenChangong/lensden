import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from 'file:///C:/Users/1/.codex/worktrees/e-verify-stateful-controls/OpenGlass%20Hub/tools/e-verify-stateful/budget.mjs';
import {validatePolicy} from 'file:///C:/Users/1/.codex/worktrees/e-verify-stateful-controls/OpenGlass%20Hub/tools/e-verify-stateful/zero-cost/policy.mjs';

export const scopeFields = Object.freeze([
  'sourceSha', 'accountId', 'worker', 'expectedProductionVersion', 'appOrigin',
  'supabaseOrigin', 'requiredCases', 'catalogRestRequests', 'actors', 'loginActions',
  'applicationPages', 'pageContentAssertions', 'staticManifest', 'ownBackgroundGet',
  'adminGet', 'authPaths', 'dynamicPrivateProfileGet', 'turnstileCapability', 'excluded', 'diagnosticConstraints', 'diagnosticLogging',
]);
export const officialSources = Object.freeze([
  'https://developers.cloudflare.com/workers/platform/pricing/',
  'https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/',
  'https://supabase.com/docs/guides/platform/cost-control',
  'https://supabase.com/docs/guides/platform/billing-faq',
  'https://developers.cloudflare.com/turnstile/plans/',
]);
export function scopeDigest(packet) {
  return sha256(Buffer.from(JSON.stringify(Object.fromEntries(scopeFields.map(k => [k, packet[k]])))));
}
const fail = () => { throw new Error('GROUP1_FREE_PLAN_EVIDENCE_INVALID'); };

// This admits only the frozen subset's billing evidence, never authorization or GO.
export function assertFreePlan(packet, proof, bytes) {
  if (JSON.stringify(packet.diagnosticConstraints) !== JSON.stringify({mode:'LOGIN_A_INITIALIZATION_ONLY',browserGETMax:8,providerDeploymentGETMax:2,totalHTTPMax:10,authDispatchMax:0,restDispatchMax:0,mutationMax:0,observationSeconds:10}) ||
      packet.executionLimitSeconds !== 300 || packet.workLimitSeconds !== 240 || packet.cleanupReserveSeconds !== 60 || packet.oauthRemainingSecondsStrictlyGreaterThan !== 360) fail();
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== packet.freePlanProofSha256 ||
      proof?.format !== 'e-verify-group1-owner-free-plan-evidence-v1' ||
      proof.ownerEvidence !== 'OWNER_ATTESTED' || proof.providerEvidence !== 'PROVIDER_DOCUMENTED' ||
      proof.pathEvidence !== 'EXECUTION_PATH_VERIFIED_OFFLINE' ||
      proof.productionOutcome !== 'NOT_EXECUTED' ||
      proof.policy?.MAX_ADDITIONAL_COST_USD !== 0 || packet.ownerBudgets?.openaiAndProviderCostUSDMax !== 0 ||
      proof.scopeSha256 !== scopeDigest(packet) || JSON.stringify(packet.requiredCases) !== JSON.stringify(['LOGIN_A_INITIALIZATION_DIAGNOSTIC']) ||
      packet.catalogRestRequests?.length !== 0 || packet.serverModerationDependency !== 'NONE_FOR_SOURCE_REVIEWED_SCOPE' ||
      proof.scopeSha256 !== packet.freePlanScopeSha256 ||
      JSON.stringify(proof.officialSources) !== JSON.stringify(officialSources) ||
      JSON.stringify(proof.services) !== JSON.stringify([
        {service: 'Cloudflare Workers/Static Assets', plan: 'Free', paidAddons: 'None'},
        {service: 'Supabase Auth/PostgREST Organization', plan: 'Free', paidAddons: 'None'},
        {service: 'Cloudflare Turnstile', plan: 'Free Widget', paidAddons: 'Not applicable to approved Free widget'},
      ])) fail();
  validatePolicy(proof.policy);
  if (packet.sourceSha !== '88680a6eaab8de4123199f16b325ec0a430b0b86' ||
      packet.accountId !== 'dcb374166b39234a499985145c075f50' || packet.worker !== 'openglasshub' ||
      packet.appOrigin !== 'https://openglasshub.ogh.workers.dev' ||
      packet.supabaseOrigin !== 'https://xcbnxzjlsvtgzixurcof.supabase.co' ||
      packet.expectedProductionVersion !== 'b2b62ec9-bb8d-4159-ac99-08fca5740134') fail();
  return true;
}
export function assertBoundFreePlan(packet) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts', 'OWNER_FREE_PLAN_EVIDENCE.json');
  const bytes = fs.readFileSync(file);
  return assertFreePlan(packet, JSON.parse(bytes), bytes);
}
