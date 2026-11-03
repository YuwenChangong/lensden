import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyObserved, negativeBody } from './monitor.mjs';
import { PrivateChannel } from './channel.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://qa.example.invalid';
test('monitor classifications keep Auth/refresh/Mutation numbers without claiming hard native control', () => {
  const rule = classifyObserved({ url: supabaseOrigin + '/auth/v1/token?grant_type=refresh_token', method: 'POST', type: 'fetch', appOrigin, supabaseOrigin, staticPaths: [] });
  assert.deepEqual(rule.charges, ['allBrowserHttpDispatchesMax', 'supabaseAuthDispatchesMax', 'applicationMutationDispatchesMax', 'ownerSessionRefreshRequestsMax']);
  assert.throws(() => classifyObserved({ url: supabaseOrigin + '/auth/v1/signup', method: 'POST', appOrigin, supabaseOrigin, staticPaths: [] }));
  assert.throws(() => classifyObserved({ url: appOrigin + '/api/admin/devices', method: 'DELETE', appOrigin, supabaseOrigin, staticPaths: [] }));
  assert.throws(() => classifyObserved({ url: 'https://unexpected.invalid/path?private=REDACT_ME', method: 'GET', appOrigin, supabaseOrigin, staticPaths: [] }));
});
test('original CAPTCHA negatives only change proof, not password/email or create valid proof', () => {
  const original = { email: 'fixture@example.invalid', password: 'LOCAL_PASSWORD', gotrue_meta_security: { captcha_token: 'LOCAL_PROOF' } };
  const bytes = Buffer.from(JSON.stringify(original));
  for (const kind of ['invalid-captcha', 'missing-captcha']) {
    const data = JSON.parse(negativeBody(kind, bytes)); assert.equal(data.email, original.email); assert.equal(data.password, original.password);
    assert.notEqual(data.gotrue_meta_security.captcha_token, original.gotrue_meta_security.captcha_token);
  }
  assert.deepEqual(JSON.parse(bytes), original); assert.throws(() => negativeBody('invalid-captcha', Buffer.from('{}')));
});
test('private SDK snapshot copy still rejects cross-profile/user/expiry and never exports refresh token', () => {
  const context = {}, binding = { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' };
  const channel = new PrivateChannel({ actor: 'A', binding, contextIdentity: context, appOrigin, supabaseOrigin, validUntil: Date.now() + 10000,
    budget: new SharedBudget({ allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, supabaseRestReadDispatchesMax: 80 }), transport: async () => { throw Error('UNREACHED'); } });
  assert.throws(() => channel.capture({ contextIdentity: {}, actor: 'A', publicKey: 'sb_publishable_FIXTURE', data: {}, refresh: false }));
  const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ iss: supabaseOrigin + '/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: binding.userId, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url') + '.UNSIGNED';
  channel.capture({ contextIdentity: context, actor: 'A', publicKey: 'sb_publishable_FIXTURE', data: { access_token: token, token_type: 'bearer', user: { id: binding.userId, email: binding.email } }, refresh: false });
  assert.equal(channel.matchesBearer('Bearer ' + token), true); channel.invalidateNativeRefresh();
  assert.equal(channel.receipt().identityVerified, false); assert.ok(!JSON.stringify(channel.receipt()).includes(token)); assert.ok(!JSON.stringify(channel.receipt()).includes(binding.email));
  channel.dispose(); assert.equal(channel.matchesBearer('Bearer ' + token), false);
});
