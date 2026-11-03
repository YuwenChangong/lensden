import { classifyObserved as original } from '../e-verify-group1-manual-auth/monitor.mjs';
export function classifyObserved(input) {
  let u;
  try { u = new URL(input.url); } catch { throw Error('OBSERVED_URL_INVALID'); }
  const external = ![input.appOrigin, input.supabaseOrigin].includes(u.origin);
  if (external) {
    if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw Error('OBSERVED_URL_INVALID');
    const headers = Object.fromEntries(Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (['authorization', 'apikey', 'x-api-key', 'proxy-authorization'].some(k => headers[k])) throw Error('OBSERVED_CREDENTIAL_ORIGIN');
    if ([...u.searchParams.keys()].some(k => /^(?:access_token|refresh_token|id_token|token|jwt|password|email|authorization|apikey|secret|captcha_token)$/i.test(k)))
      throw Error('OBSERVED_SENSITIVE_EXTERNAL_QUERY');
  }
  try { return original(input); } catch (error) {
    if (!external || u.origin === 'https://challenges.cloudflare.com' || input.method !== 'GET') throw error;
  }
  const stages = ['LOGIN', 'LANDING', 'LOGOUT'];
  const negative = ['NEGATIVE_CAPTCHA', 'NEGATIVE_MISSING_CAPTCHA', 'NEGATIVE_PASSWORD'].includes(input.stage) && input.actor === 'A';
  if (!['A', 'B', 'ADMIN'].includes(input.actor) || !input.started || !input.frameObserved || input.mainFrameNavigation
    || !(negative || stages.some(s => input.stage === s + '_' + input.actor))
    || !['fetch', 'xhr', 'script', 'stylesheet', 'document'].includes(input.type)) throw Error('EXTERNAL_GET_OBSERVATION_SCOPE');
  // Deliberately not a trust/attribution/URL whitelist or a pre-dispatch permission decision.
  return { kind: 'unenumerated-third-party-get-observed', legitimacy: 'UNKNOWN', dispatchBoundary: 'MONITOR_ONLY',
    charges: ['allBrowserHttpDispatchesMax', 'turnstileHttpDispatchesMax'] };
}
