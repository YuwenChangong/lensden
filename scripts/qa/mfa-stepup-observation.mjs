// Unwired sidecar: page installation and any owner action need new authorization.
// No network interception, SDK operation initiation, session read or persistence.
const usedForms = new WeakSet();
const usedAuth = new WeakSet();
const errorCodes = new Set(['mfa_factor_not_found', 'mfa_challenge_expired',
  'mfa_verification_failed', 'over_request_rate_limit', 'request_timeout']);
export const READY_IDLE_MS = 120000;
export const OBSERVATION_MS = 12000;
const ownValue = (object, key) => object != null
  ? Object.getOwnPropertyDescriptor(object, key)?.value : undefined;
const emptyOutcome = () => ({ invocations: 0, completion: 'UNKNOWN', success: null,
  errorCode: 'UNKNOWN', httpStatus: null });

// New manual-method projection only; it never fabricates an extension signature,
// physical tab ID or old aal1 marker. The caller must verify fresh owner authority.
export function evaluateObservedStepup(observation,readback,sdkAal,expected) {
  const blocked=()=>({status:'BLOCKED',serverAal:'UNKNOWN',reason:'STEPUP_EVIDENCE_INCOMPLETE',productionAuthority:false});
  const stage=expected?.stage??'aal2';
  if(expected?.ownerApprovalVerified!==true||!/^[a-f0-9]{64}$/.test(expected.binding??'')
    ||!/^[a-f0-9]{64}$/.test(expected.userSha256??'')||!['aal2','final'].includes(stage)
    ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(expected.nonce??'')||expected.independentCustodyReused!==true
    ||observation?.submitEvent!=='TRUSTED_OBSERVED'||observation.cleanup!=='PASS'||observation.blocked!==null
    ||['challenge','verify'].some(k=>observation[k]?.invocations!==1||observation[k]?.completion!=='RETURNED'||observation[k]?.success!==true||observation.methodsRestored?.[k]!=='RESTORED')
    ||sdkAal?.error!==null||sdkAal?.data?.currentLevel!=='aal2')return blocked();
  const r=readback,factors=r?.totpFactors;
  const start=Date.parse(r?.startedUTC),end=Date.parse(r?.finishedUTC),approved=Date.parse(expected.approvedUTC),deadline=Date.parse(expected.windowEndUTC),now=expected.now??Date.now();
  if(![start,end,approved,deadline,now].every(Number.isFinite)||deadline-approved!==10800000||start<approved||end<start||end-start>15000||end>now||now>=deadline
    ||r?.methodBinding!==expected.binding||r.nonce!==expected.nonce||r.stage!==stage||r.status!=='PASS'
    ||r.cleanup!=='PASS'||r.failure!==null||r.retries!==0||r.identityMatches!==true||r.protectedRole!=='moderator'
    ||r.userIdSha256!==expected.userSha256||r.serverAal!=='aal2'||r.mfaErrorCode!==null
    ||r.authHttpStatus!==200||r.meHttpStatus!==200||r.mfaHttpStatus!==200||r.protectedHttpStatus!==200
    ||r.adminOnlyHttpStatus!==403||r.anonymousMeHttpStatus!==(stage==='aal2'?401:null)||r.communityHttpStatus!==(stage==='aal2'?200:null)
    ||r.dispatches?.auth!==1||r.dispatches?.worker!==(stage==='aal2'?6:4)||!Array.isArray(factors)||factors.length!==2
    ||!Array.isArray(expected.factorHashes)||expected.factorHashes.length!==2||new Set(expected.factorHashes).size!==2
    ||expected.factorHashes.some(h=>!/^[a-f0-9]{64}$/.test(h))
    ||new Set(factors.map(f=>f.idSha256)).size!==2||factors.some(f=>f.status!=='verified'||!expected.factorHashes.includes(f.idSha256)))return blocked();
  return {status:'PASS',serverAal:'aal2',moderatorIdentity:'PASS',adminOnlyDenial:'PASS',twoVerifiedFactors:'PASS',productionAuthority:false};
}

export function installMfaStepupObservation(form, auth) {
  let mfa, originals;
  try {
    mfa = ownValue(auth, 'mfa');
    originals = Object.fromEntries(['challenge', 'verify'].map(name => {
      const descriptor = Object.getOwnPropertyDescriptor(mfa, name);
      if (!descriptor?.writable || typeof descriptor.value !== 'function') throw null;
      return [name, descriptor];
    }));
    if (typeof form?.addEventListener !== 'function'
        || typeof form?.removeEventListener !== 'function'
        || typeof auth?.onAuthStateChange !== 'function') throw null;
  } catch { throw new Error('MFA_OBSERVATION_METHODS_NOT_WRAPPABLE'); }
  if (usedForms.has(form) || usedAuth.has(auth)) throw new Error('MFA_OBSERVATION_ALREADY_USED');
  usedForms.add(form); usedAuth.add(auth);
  let active = true, installed = false, subscribed = false, listenerAttempted = false;
  let subscription, timer, detachedBy = null, cleanup = 'PENDING', blocked = null;
  let submitted = false, ignoredSyntheticSubmit = false, sdkMfaEvent = 'UNKNOWN';
  let deadline = performance.now() + READY_IDLE_MS;
  const outcomes = { challenge: emptyOutcome(), verify: emptyOutcome() };
  const wrappers = {}, replaced = new Set(), restored = {};

  function owns(name) { return ownValue(mfa, name) === wrappers[name]; }
  function snapshot() {
    return Object.freeze({ schemaVersion: 2, kind: 'PASSIVE_MFA_SDK_OBSERVATION',
      installation: installed ? 'WRAPPERS_INSTALLED' : 'NOT_INSTALLED', active,
      phase: submitted ? 'OWNER_SUBMITTED' : 'WAITING_TRUSTED_OWNER_SUBMIT',
      detachedBy, cleanup, blocked, ignoredSyntheticSubmit,
      submitEvent: submitted ? 'TRUSTED_OBSERVED' : 'UNKNOWN', sdkMfaEvent,
      challenge: Object.freeze({ ...outcomes.challenge }), verify: Object.freeze({ ...outcomes.verify }),
      methodsRestored: Object.freeze({ ...restored }),
      sdkAal: 'UNKNOWN', workerAal: 'UNKNOWN', protectedModerator: 'UNKNOWN',
      adminOnlyBoundary: 'UNKNOWN', productionAcceptance: 'NOT_EVALUATED', recoveryAuthorized: false });
  }

  function close(reason) {
    if (!active) return snapshot();
    active = false; detachedBy = reason; cleanup = 'PASS'; clearTimeout(timer);
    for (const name of replaced) {
      if (outcomes[name].completion === 'PENDING') outcomes[name].completion = 'UNKNOWN';
      try {
        if (!owns(name)) { restored[name] = 'NOT_OWNED'; cleanup = 'UNCONFIRMED'; continue; }
        Object.defineProperty(mfa, name, originals[name]);
        restored[name] = 'RESTORED';
      } catch { restored[name] = 'UNCONFIRMED'; cleanup = 'UNCONFIRMED'; }
    }
    if (listenerAttempted) {
      try { form.removeEventListener('submit', onSubmit, true); }
      catch { cleanup = 'UNCONFIRMED'; }
    }
    if (subscribed) {
      try {
        if (typeof subscription?.unsubscribe !== 'function') throw null;
        subscription.unsubscribe();
      } catch { cleanup = 'UNCONFIRMED'; }
    }
    return snapshot();
  }
  function inTime() {
    if (active && performance.now() >= deadline) close('DEADLINE');
    return active;
  }
  function armTimer() {
    clearTimeout(timer);
    if (inTime()) timer = setTimeout(() => close('DEADLINE'), Math.max(0, deadline - performance.now()));
  }
  function stop(code) { blocked ??= code; throw new Error(code); }
  function onSubmit(event) {
    if (!installed || !inTime()) return;
    if (event?.isTrusted !== true) { ignoredSyntheticSubmit = true; return; }
    if (submitted) { blocked ??= 'MFA_OBSERVATION_REPEAT_BLOCKED'; return; }
    submitted = true; deadline = performance.now() + OBSERVATION_MS; armTimer();
  }
  // Ignore the session argument, and never call Auth from its callback.
  function onAuthEvent(event) {
    if (installed && inTime() && submitted && event === 'MFA_CHALLENGE_VERIFIED') sdkMfaEvent = 'OBSERVED';
  }
  function settle(name, completion, value) {
    if (!inTime()) return;
    const result = outcomes[name];
    try {
      const error = completion === 'RETURNED' ? ownValue(value, 'error') : value;
      if (completion === 'RETURNED' && error === undefined) throw null;
      result.completion = completion;
      result.success = completion === 'RETURNED' && error === null;
      if (result.success) result.errorCode = null;
      else {
        const code = ownValue(error, 'code'), status = ownValue(error, 'status');
        result.errorCode = errorCodes.has(code) ? code : 'UNLISTED';
        result.httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
        blocked ??= 'MFA_OBSERVATION_SDK_FAILURE';
      }
    } catch {
      result.completion = 'UNKNOWN'; result.success = null;
      result.errorCode = 'UNKNOWN'; result.httpStatus = null;
      blocked ??= 'MFA_OBSERVATION_RESULT_UNAVAILABLE';
    }
  }
  function makeWrapper(name) {
    return function () {
      if (!installed || !inTime()) throw new Error('MFA_OBSERVATION_CLOSED');
      if (blocked) throw new Error(blocked);
      if (!owns('challenge') || !owns('verify') || ownValue(auth, 'mfa') !== mfa) {
        stop('MFA_OBSERVATION_METHOD_REPLACED');
      }
      if (!submitted) stop('MFA_OBSERVATION_TRUSTED_SUBMIT_REQUIRED');
      if (outcomes[name].invocations) stop('MFA_OBSERVATION_REPEAT_BLOCKED');
      if (name === 'verify' && outcomes.challenge.success !== true) stop('MFA_OBSERVATION_ORDER_BLOCKED');
      outcomes[name].invocations = 1; outcomes[name].completion = 'PENDING';
      let returned;
      try {
        // Forward only: never inspect, copy, retain or project arguments.
        returned = Reflect.apply(originals[name].value, this, arguments);
      } catch (error) { settle(name, 'THREW', error); throw error; }
      try {
        // Observe settlement without replacing the caller's promise/result/error.
        // Read only the error descriptor; never access response data.
        Promise.prototype.then.call(returned,
          value => { settle(name, 'RETURNED', value); },
          error => { settle(name, 'REJECTED', error); });
      } catch { blocked ??= 'MFA_OBSERVATION_PROMISE_UNAVAILABLE'; outcomes[name].completion = 'UNKNOWN'; }
      return returned;
    };
  }
  try {
    for (const name of ['challenge', 'verify']) {
      wrappers[name] = makeWrapper(name);
      Object.defineProperty(mfa, name, { ...originals[name], value: wrappers[name] });
      replaced.add(name);
      if (!owns(name)) throw null;
    }
    subscribed = true;
    subscription = auth.onAuthStateChange(onAuthEvent)?.data?.subscription;
    if (typeof subscription?.unsubscribe !== 'function') throw null;
    listenerAttempted = true;
    form.addEventListener('submit', onSubmit, { capture: true, passive: true });
    installed = true; armTimer();
  } catch {
    close('INSTALL_FAILED');
    throw new Error(cleanup === 'PASS' ? 'MFA_OBSERVATION_INSTALL_FAILED' : 'MFA_OBSERVATION_CLEANUP_UNCONFIRMED');
  }
  return Object.freeze({ snapshot, detach: () => close('OWNER_DETACH') });
}
