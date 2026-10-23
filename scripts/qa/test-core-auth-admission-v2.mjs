import test from 'node:test';
import assert from 'node:assert/strict';
import {authEvidence, mailboxAdmission, createdActorEvidence, continuationDecision} from './core-auth-admission-v2.mjs';

// Nonsecret, offline-only values. No mailbox ownership or live authority is inferred.
const expected = {project: 'xcbnxzjlsvtgzixurcof', email: 'qa-a@fixture-mailbox.dev', namespace: 'ogh-core-offline-fixture'};
const id = '00000000-0000-4000-8000-000000000001';
const user = () => ({id, email: expected.email, user_metadata: {qa_namespace: expected.namespace}, email_confirmed_at: '2026-10-23T06:14:43.159Z'});
const creation = (u = user(), extra = {}) => createdActorEvidence({user: u, expected, sourceProject: expected.project, successfulCreate: true, ...extra});
const login = (extra = {}) => authEvidence({status: 200, body: {user: {id}, access_token: 'OFFLINE_ACCESS', refresh_token: 'OFFLINE_REFRESH'}, expectedId: id, completion: 'CONFIRMED', ...extra});

test('reserved/test domains never admit even with an ownership assertion', () => {
  for (const email of ['a@example.invalid', 'a@example.com', 'a@sub.example.net', 'a@example.org', 'a@test', 'a@mail.test', 'a@localhost', 'a@sub.localhost', 'a@domain.example']) {
    assert.equal(mailboxAdmission({email, exactAddressApproved: true, ownershipConfirmed: true}).status, 'BLOCKED');
  }
});

test('a syntactically valid mailbox still requires exact owner approval and ownership', () => {
  for (const flags of [{}, {ownershipConfirmed: true}, {exactAddressApproved: true}, {ownershipConfirmed: 'true', exactAddressApproved: true}]) {
    assert.equal(mailboxAdmission({email: expected.email, ...flags}).status, 'BLOCKED');
  }
  const e = mailboxAdmission({email: expected.email, exactAddressApproved: true, ownershipConfirmed: true});
  assert.equal(e.status, 'ELIGIBLE_FOR_EXACT_PACKET_BINDING');
  assert.equal(e.productionAuthority, false);
  assert.ok(!JSON.stringify(e).includes(expected.email));
});

test('invalid email shapes fail closed', () => {
  for (const email of ['', undefined, 'a@fixture-mailbox.dev\n', 'a@@fixture-mailbox.dev', 'a..b@fixture-mailbox.dev', 'a@-fixture-mailbox.dev', 'a@[127.0.0.1]']) {
    assert.equal(mailboxAdmission({email, exactAddressApproved: true, ownershipConfirmed: true}).status, 'BLOCKED');
  }
});

test('login success requires confirmed completion, matching UUID and both tokens', () => {
  assert.equal(login().classification, 'SUCCESS');
  for (const body of [{}, {user: {id}, access_token: ''}, {user: {id: 'wrong'}, access_token: 'A', refresh_token: 'R'}, {user: {id}, access_token: 'A', refresh_token: ''}]) {
    assert.equal(login({body}).classification, 'UNCONFIRMED');
  }
});

test('invalid domain uses structured Auth code despite numeric legacy code', () => {
  const e = login({status: 400, body: {code: 400, error_code: 'email_address_invalid'}});
  assert.equal(e.errorCode, 'email_address_invalid');
  assert.equal(e.classification, 'EMAIL_ADDRESS_INVALID');
  assert.equal(e.httpStatus, 400);
});

test('unconfirmed email and invalid credentials remain distinct', () => {
  for (const [code, classification] of [['email_not_confirmed', 'EMAIL_NOT_CONFIRMED'], ['invalid_credentials', 'INVALID_CREDENTIALS']]) {
    assert.equal(login({status: 400, body: {code}}).classification, classification);
  }
});

test('known unexpected errors are recorded without messages or body fields', () => {
  const e = login({status: 500, body: {code: 'unexpected_failure', msg: 'PRIVATE_SENTINEL', email: expected.email}});
  assert.equal(e.classification, 'OTHER_AUTH_ERROR');
  assert.equal(e.errorCode, 'unexpected_failure');
  assert.ok(!JSON.stringify(e).includes('PRIVATE_SENTINEL'));
  assert.ok(!JSON.stringify(e).includes(expected.email));
});

test('unknown error codes and missing HTTP response remain unknown', () => {
  assert.equal(login({status: 400, body: {code: 'PRIVATE_SENTINEL'}}).errorCode, null);
  const e = login({status: undefined, completion: 'UNCONFIRMED'});
  assert.equal(e.httpStatus, null);
  assert.equal(e.classification, 'UNCONFIRMED');
});

test('incomplete response can never become success from an observed 200', () => {
  assert.equal(login({completion: 'UNCONFIRMED'}).classification, 'UNCONFIRMED');
  assert.equal(login({status: 302}).classification, 'UNCONFIRMED');
});

test('only allowlisted safe correlation identifiers can leave memory', () => {
  const e = login({headers: new Headers({'sb-request-id': id, 'cf-ray': 'a4e73e2add07cc8f-AKL', 'authorization': 'PRIVATE_SENTINEL', 'x-request-id': 'PRIVATE_SENTINEL'})});
  assert.deepEqual(e.correlations, {'sb-request-id': id, 'cf-ray': 'a4e73e2add07cc8f-AKL'});
  assert.ok(!JSON.stringify(e).includes('PRIVATE_SENTINEL'));
  assert.ok(!JSON.stringify(e).includes('OFFLINE_ACCESS'));
});

test('creation requires actual email confirmation, not requested email_confirm', () => {
  assert.equal(creation().loginAdmission, 'PASS');
  for (const email_confirmed_at of [undefined, null, '', 'invalid', '2026-02-30T00:00:00Z']) {
    const e = creation({...user(), email_confirm: true, email_confirmed_at});
    assert.equal(e.identityVerified, true);
    assert.equal(e.loginAdmission, 'BLOCKED');
  }
});

test('exact provider identity and namespace are mandatory without clock-equality gate', () => {
  assert.equal(creation({...user(), created_at: '1999-01-01T00:00:00Z'}).loginAdmission, 'PASS');
  for (const u of [{...user(), id: 'invalid'}, {...user(), email: 'other@fixture-mailbox.dev'}, {...user(), user_metadata: {qa_namespace: 'other'}}]) {
    assert.equal(creation(u).identityVerified, false);
  }
  assert.equal(creation(user(), {sourceProject: 'wrong'}).identityVerified, false);
  assert.equal(creation(user(), {successfulCreate: false}).identityVerified, false);
});

test('first login failure blocks second account/business but permits separately approved exact containment', () => {
  const e = continuationDecision({firstLogin: 'INVALID_CREDENTIALS', secondLogin: 'NOT_STARTED', exactCreatedIdentityVerified: true, independentContainmentApproved: true});
  assert.equal(e.mayCreateSecond, false);
  assert.equal(e.mayStartBusiness, false);
  assert.equal(e.mayContainExactCreatedActor, true);
  assert.equal(e.firstFailure, 'INVALID_CREDENTIALS');
});

test('unknown login may contain a proven fresh UUID, never an ambiguous creation', () => {
  const input = {firstLogin: 'UNCONFIRMED', exactCreatedIdentityVerified: true, independentContainmentApproved: true};
  assert.equal(continuationDecision(input).mayContainExactCreatedActor, true);
  assert.equal(continuationDecision({...input, exactCreatedIdentityVerified: false}).mayContainExactCreatedActor, false);
  assert.equal(continuationDecision({...input, independentContainmentApproved: false}).mayContainExactCreatedActor, false);
});

test('business requires both authenticated actors; unknown input never opens the gate', () => {
  assert.equal(continuationDecision({firstLogin: 'SUCCESS'}).mayCreateSecond, false);
  assert.equal(continuationDecision({firstLogin: 'SUCCESS', firstOrdinaryRoleVerified: true}).mayCreateSecond, true);
  assert.equal(continuationDecision({firstLogin: 'SUCCESS'}).mayStartBusiness, false);
  assert.equal(continuationDecision({firstLogin: 'SUCCESS', secondLogin: 'SUCCESS'}).mayStartBusiness, false);
  assert.equal(continuationDecision({firstLogin: 'SUCCESS', secondLogin: 'SUCCESS', firstOrdinaryRoleVerified: true, secondOrdinaryRoleVerified: true}).mayStartBusiness, true);
  assert.equal(continuationDecision({firstLogin: 'PRIVATE_SENTINEL'}).firstFailure, 'UNKNOWN');
});

test('containment readback cannot qualify a mismatched identity or unapproved operation', () => {
  const input = {exactCreatedIdentityVerified: true, independentContainmentApproved: true, containmentResult: 'INDEPENDENT_READBACK_VERIFIED'};
  assert.equal(continuationDecision(input).containmentStatus, 'VERIFIED');
  assert.equal(continuationDecision({...input, exactCreatedIdentityVerified: false}).containmentStatus, 'UNKNOWN');
  assert.equal(continuationDecision({...input, independentContainmentApproved: false}).containmentStatus, 'UNKNOWN');
});

test('failed or ambiguous containment cannot mask login failure or imply cleanup PASS', () => {
  for (const containmentResult of ['PUT_SUCCEEDED', 'FAILED', undefined]) {
    const e = continuationDecision({firstLogin: 'EMAIL_ADDRESS_INVALID', exactCreatedIdentityVerified: true, independentContainmentApproved: true, containmentResult});
    assert.equal(e.containmentStatus, 'UNKNOWN');
    assert.equal(e.firstFailure, 'EMAIL_ADDRESS_INVALID');
    assert.equal(e.credentialCleanup, 'PROTECTED_RETAINED');
  }
});
