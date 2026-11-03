import test from 'node:test';
import assert from 'node:assert/strict';
import { PrivateChannel } from '../e-verify-group1-manual-auth/channel.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
const app = 'https://app.example.invalid', db = 'https://qa.example.invalid';
const identities = Object.fromEntries(['A', 'B', 'ADMIN'].map((actor, i) => [actor, {
  userId: String(i + 1).repeat(8) + '-1111-4111-8111-111111111111', email: 'fixture-' + i + '@example.invalid', applicationRole: actor === 'ADMIN' ? 'admin' : 'user'
}]));
function setup(actor, globalMax = 650) {
  const context = {}, binding = identities[actor]; let calls = 0;
  const budget = new SharedBudget({ allBrowserHttpDispatchesMax: globalMax, supabaseAuthDispatchesMax: 40, supabaseRestReadDispatchesMax: 80 });
  const channel = new PrivateChannel({ actor, binding, contextIdentity: context, supabaseOrigin: db, appOrigin: app, budget,
    transport: async () => { calls++; return { status: 401, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') }; }, validUntil: Date.now() + 60000 });
  const token = sub => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ iss: db + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub,
    exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url') + '.OFFLINE_UNSIGNED_FIXTURE';
  const capture = (changes = {}) => channel.capture({ contextIdentity: context, actor, publicKey: 'sb_publishable_OFFLINE_ONLY',
    data: { access_token: token(binding.userId), token_type: 'bearer', user: { id: binding.userId, email: binding.email } }, refresh: false, ...changes });
  return { channel, context, binding, capture, token, calls: () => calls };
}
test('an unresolved browser observation creates no Session or RLS permission for A/B/ADMIN', async () => {
  for (const actor of ['A', 'B', 'ADMIN']) { const s = setup(actor);
    try { await assert.rejects(s.channel.catalog('RLS_A_SPECS'), /PRIVATE_SESSION_MISSING/); assert.equal(s.calls(), 0); }
    finally { s.channel.dispose(); assert.equal(s.channel.receipt().destroyed, true); }
  }
});
test('cross-actor and invalid token snapshots cannot bypass the unchanged memory identity filter', () => {
  for (const actor of ['A', 'B', 'ADMIN']) {
    const s = setup(actor), wrong = setup(actor);
    try { assert.throws(() => s.capture({ actor: actor === 'A' ? 'B' : 'A' }), /PRIVATE_CONTEXT_INVALID/);
      assert.equal(s.calls(), 0);
      assert.throws(() => wrong.capture({ data: { access_token: 'INVALID_FIXTURE', token_type: 'bearer', user: {} } }));
      assert.equal(wrong.calls(), 0);
    } finally { s.channel.dispose(); wrong.channel.dispose(); }
  }
});
test('decoded token and page success cannot replace authoritative Node authentication before RLS', async () => {
  const s = setup('A');
  try { s.capture(); await assert.rejects(s.channel.verifyActor(), /IDENTITY_OR_ROLE_MISMATCH/);
    assert.equal(s.calls(), 1); await assert.rejects(s.channel.catalog('RLS_A_SPECS'));
    assert.equal(s.calls(), 1); assert.equal(s.channel.receipt().identityVerified, false);
  } finally { s.channel.dispose(); }
});
test('fixed Node identity request still reserves hard budget before transport', async () => {
  const s = setup('A', 0);
  try { s.capture(); await assert.rejects(s.channel.verifyActor()); assert.equal(s.calls(), 0);
    await assert.rejects(s.channel.catalog('RLS_A_SPECS')); assert.equal(s.calls(), 0);
  } finally { s.channel.dispose(); }
});
