// Offline admission/receipt helpers only: no transport, credentials or execution authority.
// Live integration must bind owner consent, journaled UUIDs, budgets and readback evidence.
const PROJECT = 'xcbnxzjlsvtgzixurcof';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODES = new Set([
  'email_address_invalid', 'email_address_not_authorized', 'email_not_confirmed',
  'invalid_credentials', 'captcha_failed', 'user_banned', 'email_provider_disabled',
  'phone_provider_disabled', 'validation_failed', 'bad_json', 'unexpected_failure',
  'request_timeout', 'over_request_rate_limit', 'over_email_send_rate_limit',
  'weak_password', 'signup_disabled', 'user_not_found', 'session_not_found',
  'refresh_token_not_found', 'refresh_token_already_used', 'invalid_grant',
]);
const CLASSIFICATIONS = new Set([
  'EMAIL_ADDRESS_INVALID', 'EMAIL_NOT_CONFIRMED', 'INVALID_CREDENTIALS',
  'OTHER_AUTH_ERROR', 'UNKNOWN', 'UNCONFIRMED',
]);

export function mailboxAdmission({email, exactAddressApproved, ownershipConfirmed} = {}) {
  const blocked = reason => ({status: 'BLOCKED', reason, productionAuthority: false});
  if (typeof email !== 'string' || email.length > 254 || email !== email.trim()) return blocked('EMAIL_SHAPE');
  const parts = email.split('@');
  if (parts.length !== 2) return blocked('EMAIL_SHAPE');
  const [local, rawDomain] = parts;
  const domain = rawDomain.toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/i.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return blocked('EMAIL_SHAPE');
  if (domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return blocked('EMAIL_SHAPE');
  if (/(^|\.)(?:invalid|test|example|localhost)$/.test(domain) || /(^|\.)example\.(?:com|net|org)$/.test(domain) || domain === 'test') return blocked('RESERVED_OR_TEST_DOMAIN');
  if (!domain.includes('.') || !/[a-z]{2,}$/i.test(domain)) return blocked('EMAIL_SHAPE');
  if (exactAddressApproved !== true || ownershipConfirmed !== true) return blocked('OWNER_CONTROLLED_MAILBOX_NOT_BOUND');
  return {status: 'ELIGIBLE_FOR_EXACT_PACKET_BINDING', reason: null, productionAuthority: false};
}

export function authEvidence({status, body, headers, expectedId, completion} = {}) {
  const httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  const code = [body?.error_code, body?.code, body?.error].find(v => typeof v === 'string' && CODES.has(v)) ?? null;
  const correlations = {};
  for (const name of ['sb-request-id', 'x-request-id', 'cf-ray']) {
    const value = headers?.get?.(name);
    const valid = name === 'cf-ray' ? /^[a-f0-9]{16}-[A-Z]{3}$/i : UUID;
    if (typeof value === 'string' && valid.test(value)) correlations[name] = value;
  }
  let classification = 'UNCONFIRMED';
  if (completion === 'CONFIRMED' && httpStatus >= 400) {
    classification = code === 'email_address_invalid' ? 'EMAIL_ADDRESS_INVALID'
      : code === 'email_not_confirmed' ? 'EMAIL_NOT_CONFIRMED'
      : code === 'invalid_credentials' ? 'INVALID_CREDENTIALS'
      : code ? 'OTHER_AUTH_ERROR' : 'UNKNOWN';
  } else if (completion === 'CONFIRMED' && httpStatus === 200 && code === null
    && typeof expectedId === 'string' && UUID.test(expectedId) && body?.user?.id === expectedId
    && typeof body?.access_token === 'string' && body.access_token.length > 0
    && typeof body?.refresh_token === 'string' && body.refresh_token.length > 0) {
    classification = 'SUCCESS';
  }
  return {httpStatus, errorCode: httpStatus >= 400 ? code : null, classification, correlations, bodyPersisted: false};
}

function validConfirmation(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const localDate = value.slice(0, 10);
  const parsedDate = new Date(localDate + 'T00:00:00Z');
  return Number.isFinite(Date.parse(value)) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === localDate;
}

export function createdActorEvidence({user, expected, sourceProject, successfulCreate} = {}) {
  const identityVerified = successfulCreate === true && sourceProject === PROJECT && expected?.project === PROJECT
    && typeof user?.id === 'string' && UUID.test(user.id)
    && typeof expected?.email === 'string' && user.email === expected.email
    && typeof expected?.namespace === 'string' && expected.namespace.length > 0
    && user?.user_metadata?.qa_namespace === expected.namespace;
  const emailConfirmed = validConfirmation(user?.email_confirmed_at);
  return {identityVerified, emailConfirmed, loginAdmission: identityVerified && emailConfirmed ? 'PASS' : 'BLOCKED',
    clientServerTimestampEqualityRequired: false, profileRoleVerified: false};
}

export function continuationDecision({firstLogin, secondLogin = 'NOT_STARTED', exactCreatedIdentityVerified,
  firstOrdinaryRoleVerified, secondOrdinaryRoleVerified, independentContainmentApproved, containmentResult} = {}) {
  const failed = value => CLASSIFICATIONS.has(value) ? value : 'UNKNOWN';
  const firstFailure = firstLogin !== 'SUCCESS' ? failed(firstLogin)
    : secondLogin !== 'SUCCESS' && secondLogin !== 'NOT_STARTED' ? failed(secondLogin) : null;
  return {
    mayCreateSecond: firstLogin === 'SUCCESS' && firstOrdinaryRoleVerified === true && secondLogin === 'NOT_STARTED',
    mayStartBusiness: firstLogin === 'SUCCESS' && secondLogin === 'SUCCESS'
      && firstOrdinaryRoleVerified === true && secondOrdinaryRoleVerified === true,
    mayContainExactCreatedActor: exactCreatedIdentityVerified === true && independentContainmentApproved === true,
    firstFailure,
    containmentStatus: exactCreatedIdentityVerified === true && independentContainmentApproved === true
      && containmentResult === 'INDEPENDENT_READBACK_VERIFIED' ? 'VERIFIED' : 'UNKNOWN',
    credentialCleanup: 'PROTECTED_RETAINED', productionAuthority: false,
  };
}
