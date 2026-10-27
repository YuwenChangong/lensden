import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { checkPlan, runSessionChecks, buildOwnerSnippet, runFreshOneActorForeignIsolation } from './core-ordinary-session-checks.mjs';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const post = '33333333-3333-4333-8333-333333333333';
const comment = '44444444-4444-4444-8444-444444444444';
const media = '55555555-5555-4555-8555-555555555555';
const namespace = 'ogh-core-ordinary-20261024-nonsecret-fixture';
function plan(stage = 'auth') {
  return { binding: 'a'.repeat(64), namespace, journalVerified: true, actorId: stage === 'rls-b' ? b : a,
    actor: stage === 'rls-b' ? 'B3' : 'A3', stage, deadlineUTC: new Date(Date.now() + 60000).toISOString(),
    fixtures: { actorA: a, actorB: b, postA: post, commentB: comment, imageMediaA: media } };
}
function fixture(p, options = {}) {
  const rows = {
    profiles: [{ id: a, role: options.role || 'user' }, { id: b, role: options.role || 'user' }],
    posts: [{ id: post, author_id: a, body: `${namespace} text`,status:'published',moderation_status:'published' }],
    comments: [{ id: comment, author_id: b, post_id: post, body: `${namespace} comment` }],
    post_media: [{ id: media, user_id: a, post_id: post, kind:'video',storage_path: p.fixtures?.videoPath ?? `${a}/${namespace}-image.png` }],
    post_media_r2_copy_claims:[{post_id:post,user_id:a,claim_id:media,mime_type:'video/mp4',retained_key:`${a}/${post}/r2-retained-${media}.mp4`}],
  };
  const user = { id: options.wrongId ? b : p.actorId, email: `fixture+ogh-${p.actor.toLowerCase()}-0123456789abcdef@gmail.com`, email_confirmed_at: '2026-10-23T01:00:00Z', created_at: options.missingCreatedAt ? undefined : '2026-10-23T00:59:00.123Z' };
  let authCalls = 0;
  const authResult = async () => { authCalls++; return options.authError
    ? { error: { status: 400, code: 'invalid_credentials', message: 'PRIVATE_ERROR_NOT_EXPORTED' } }
    : { data: { user }, error: null }; };
  const client = { auth: { getUser: authResult, refreshSession: authResult, signOut: async () => ({ data: {}, error: null }) },
    from(table) {
      let mode = 'select', values, filters = [];
      const q = {
        select() { return q; }, eq(k, v) { filters.push([k, v]); return q; }, limit() { return q; },
        update(v) { mode = 'update'; values = v; return q; }, delete() { mode = 'delete'; return q; },
        then(resolve, reject) {
          const selected = rows[table].filter(r => filters.every(([k, v]) => r[k] === v));
          if (mode === 'select') return Promise.resolve({ data: structuredClone(selected), error: null, status: 200 }).then(resolve, reject);
          const ownAllowed = table === 'posts' && p.actorId === a;
          if (!ownAllowed && !options.allowForbidden) return Promise.resolve(options.unauthorized
            ? { status: 401, error: { status: 401 } }
            : options.rlsError ? { status: 403, error: { code: '42501' } } : { status: 200, data: [], error: null }).then(resolve, reject);
          if (mode === 'update') for (const row of selected) Object.assign(row, values);
          else rows[table] = rows[table].filter(r => !selected.includes(r));
          return Promise.resolve({ status: 200, data: selected.map(r => ({ id: r.id })), error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { client, authCalls: () => authCalls };
}

test('valid post-login plan', () => assert.equal(checkPlan(plan()).actor, 'A3'));
for (const [key, value] of [['binding','bad'], ['actorId','bad'], ['journalVerified',false], ['actor','admin'], ['stage','login'], ['deadlineUTC','invalid'], ['deadlineUTC','2020-01-01T00:00:00Z']]) {
  test(`invalid plan ${key} ${value}`, () => assert.throws(() => checkPlan({ ...plan(), [key]: value })));
}
test('fixture actor mismatch before request', () => assert.throws(() => checkPlan({ ...plan('rls-b'), actorId: a })));
test('actual Auth/profile/refresh sequence', async () => {
  const p = plan(), f = fixture(p), r = await runSessionChecks(f.client, p);
  assert.equal(r.status, 'PASS'); assert.deepEqual(r.counts, { auth: 3, rest: 1 }); assert.equal(f.authCalls(), 3);
});
test('identity mismatch stops before profile/refresh', async () => {
  const p = plan(), r = await runSessionChecks(fixture(p, { wrongId: true }).client, p);
  assert.equal(r.reason, 'SESSION_IDENTITY_MISMATCH'); assert.equal(r.counts.rest, 0);
});
test('admin profile is not ordinary', async () => {
  const p = plan(), r = await runSessionChecks(fixture(p, { role: 'admin' }).client, p);
  assert.equal(r.reason, 'ORDINARY_PROFILE_NOT_PROVEN');
});
test('Auth errors are allowlisted without raw messages', async () => {
  const p = plan(), r = await runSessionChecks(fixture(p, { authError: true }).client, p);
  assert.equal(r.authError.errorCode, 'invalid_credentials'); assert.ok(!JSON.stringify(r).includes('PRIVATE_ERROR'));
});
test('A own update and foreign comment denial readbacks', async () => {
  const p = plan('rls-a'), r = await runSessionChecks(fixture(p).client, p);
  assert.equal(r.status, 'PASS'); assert.equal(r.counts.rest, 6);
});
test('B foreign post media and role denial readbacks', async () => {
  const p = plan('rls-b'), r = await runSessionChecks(fixture(p, { rlsError: true }).client, p);
  assert.equal(r.status, 'PASS'); assert.equal(r.counts.rest, 9);
});
test('401 is not RLS proof', async () => {
  const p = plan('rls-b'), r = await runSessionChecks(fixture(p, { unauthorized: true }).client, p);
  assert.equal(r.reason, 'AUTH_FAILURE_NOT_RLS_PROOF');
});
test('unexpected write stops with no automatic repair', async () => {
  const p = plan('rls-b'), r = await runSessionChecks(fixture(p, { allowForbidden: true }).client, p);
  assert.equal(r.reason, 'UNEXPECTED_WRITE_SUCCESS'); assert.equal(r.counts.rest, 2);
});
test('logout acknowledgement not independent JWT revocation proof', async () => {
  const p = plan('logout'), r = await runSessionChecks(fixture(p).client, p);
  assert.equal(r.status, 'PASS'); assert.deepEqual(r.counts, { auth: 2, rest: 0 });
});
test('timeout stops once and late completion cannot become PASS', async () => {
  const p = plan(); let calls = 0, complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const r = await runSessionChecks({ auth: { getUser() { calls++; return pending; } } }, p);
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.reason, 'REQUEST_COMPLETION_UNKNOWN');
  complete({ data: { user: { id: a } } });
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(r.status, 'BLOCKED');
});
test('response after stage deadline cannot become PASS', async () => {
  const p = { ...plan(), deadlineUTC: new Date(Date.now() + 20).toISOString() };
  const client = { auth: { getUser: () => new Promise(resolve => setTimeout(() => resolve({ data: { user: { id: a } } }), 40)) } };
  const r = await runSessionChecks(client, p);
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.reason, 'DEADLINE_EXPIRED'); assert.equal(r.counts.rest, 0);
});
test('generated owner snippet executes actual check with private-free download', async () => {
  const p = plan(), f = fixture(p); let saved;
  const storage = new Map();
  const context = vm.createContext({ location: { origin: 'https://openglasshub.ogh.workers.dev' },
    sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    Blob: class { constructor(parts) { saved = JSON.parse(parts[0]); } },
    document: { createElement: () => ({ click() {} }) }, URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} },
    setTimeout, clearTimeout, client: f.client });
  const snippet = buildOwnerSnippet(p).replace(/await import\("[^\"]+"\)/, '({n:()=>client})');
  assert.equal((await vm.runInContext(snippet, context)).status, 'PASS');
  assert.equal(saved.status, 'PASS'); assert.ok(!JSON.stringify(saved).includes('email_confirmed_at'));
  await assert.rejects(vm.runInContext(snippet, context), /CONSUMED/);
});
test('no credential export, direct login, or controller dependency', async () => {
  const source = await readFile(new URL('./core-ordinary-session-checks.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /signInWithPassword|access_token|refresh_token|document\.cookie|localStorage|playwright|puppeteer|process\.env/);
});
test('smoke amendment exact private alias matches authenticated user', async () => {
  const p = { ...plan(), expectedEmail: 'fixture+ogh-a3-0123456789abcdef@gmail.com' };
  const r = await runSessionChecks(fixture(p).client, p);
  assert.equal(r.status, 'PASS'); assert.ok(!JSON.stringify(r).includes('@gmail.com'));
});
test('smoke amendment private alias mismatch blocks before profile', async () => {
  const p = { ...plan(), expectedEmail: 'other+ogh-a3-0123456789abcdef@gmail.com' };
  const r = await runSessionChecks(fixture(p).client, p);
  assert.equal(r.reason, 'SESSION_IDENTITY_MISMATCH'); assert.equal(r.counts.rest, 0);
});
test('smoke amendment malformed private alias blocks', () => {
  assert.throws(() => checkPlan({ ...plan(), expectedEmail: 'invalid' }), /PRIVATE_EMAIL_BINDING_INVALID/);
});
test('smoke amendment only foreign post update and ordinary profile checked', async () => {
  const p = { ...plan('rls-b'), stage: 'smoke-rls-b' };
  delete p.fixtures.commentB; delete p.fixtures.imageMediaA;
  const r = await runSessionChecks(fixture(p).client, p);
  assert.equal(r.status, 'PASS'); assert.deepEqual(r.counts, { auth: 1, rest: 4 });
  assert.equal(r.checks.foreignPostDeniedUnchanged, true);
  assert.equal(r.checks.foreignMediaDeniedUnchanged, undefined);
});

function freshBindingPlan() {
  const p={...plan(),stage:'bind-auth',expectedEmail:'fixture+ogh-a3-0123456789abcdef@gmail.com',priorAliasAbsenceSha256:'f'.repeat(64)};
  delete p.actorId;return p;
}
test('fresh binding resolves actual UUID with one Auth read and ordinary Profile read',async()=>{
  const p=freshBindingPlan(),f=fixture({...p,actorId:a}),r=await runSessionChecks(f.client,p);
  assert.equal(r.status,'PASS');assert.equal(r.actorId,a);assert.deepEqual(r.counts,{auth:1,rest:1});
  assert.equal(r.checks.freshIdentityBound,true);assert.equal(r.checks.refreshedIdentity,undefined);
  assert(!JSON.stringify(r).includes('@gmail.com'));
  assert.equal(r.providerCreatedAtUTC,'2026-10-23T00:59:00.123Z');
});
test('fresh binding retains no identity success when provider creation time is absent',async()=>{
  const p=freshBindingPlan(),r=await runSessionChecks(fixture({...p,actorId:a},{missingCreatedAt:true}).client,p);
  assert.equal(r.reason,'PROVIDER_CREATION_TIME_UNKNOWN');assert.equal(r.providerCreatedAtUTC,undefined);
});
test('fresh binding requires exact private alias and an absence receipt before dispatch',async()=>{
  for(const key of ['expectedEmail','priorAliasAbsenceSha256']){
    const p=freshBindingPlan();delete p[key];const f=fixture({...p,actorId:a});
    await assert.rejects(()=>runSessionChecks(f.client,p));assert.equal(f.authCalls(),0);
  }
});
test('fresh binding rejects wrong mailbox without reading Profile',async()=>{
  const p=freshBindingPlan(),f=fixture({...p,actorId:a});p.expectedEmail='other+ogh-a3-0123456789abcdef@gmail.com';
  const r=await runSessionChecks(f.client,p);assert.equal(r.reason,'SESSION_IDENTITY_MISMATCH');assert.equal(r.counts.rest,0);
});
test('fresh binding does not adopt privileged identity or invalid UUID',async()=>{
  const p=freshBindingPlan();
  assert.equal((await runSessionChecks(fixture({...p,actorId:a},{role:'moderator'}).client,p)).reason,'ORDINARY_PROFILE_NOT_PROVEN');
  const r=await runSessionChecks(fixture({...p,actorId:'invalid'}).client,p);assert.equal(r.reason,'SESSION_IDENTITY_MISMATCH');assert.equal(r.counts.rest,0);
});
test('fresh binding snippet carries the exact absence proof and is single use',async()=>{
  const p=freshBindingPlan(),f=fixture({...p,actorId:a});let saved;const storage=new Map();
  const context=vm.createContext({location:{origin:'https://openglasshub.ogh.workers.dev'},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Blob:class{constructor(parts){saved=JSON.parse(parts[0]);}},document:{createElement:()=>({click(){}})},URL:{createObjectURL:()=>'blob:fixture',revokeObjectURL(){}},setTimeout,clearTimeout,client:f.client});
  const snippet=buildOwnerSnippet(p).replace(/await import\("[^\"]+"\)/,'({n:()=>client})');
  assert.equal((await vm.runInContext(snippet,context)).status,'PASS');assert.equal(saved.actorId,a);
  await assert.rejects(vm.runInContext(snippet,context),/CONSUMED/);
});

function mediaSmokePlan() {
  return {...plan('rls-b'),stage:'smoke-media-rls-b',fixtures:{actorA:a,actorB:b,postA:post,videoMediaA:media,videoPath:`${a}/${post}/retained.mp4`}};
}
test('video smoke denies foreign post update and delete plus exact retained video delete',async()=>{
  const p=mediaSmokePlan(),r=await runSessionChecks(fixture(p).client,p);
  assert.equal(r.status,'PASS');assert.deepEqual(r.counts,{auth:1,rest:9});
  assert.equal(r.checks.foreignPostDeleteDeniedUnchanged,true);assert.equal(r.checks.foreignMediaDeniedUnchanged,true);
  assert(!JSON.stringify(r).includes('retained.mp4'));
});
test('video smoke refuses unbound media and tmp destination before requests',()=>{
  for(const videoPath of [`tmp/${a}/${post}/retained.mp4`,`${b}/${post}/retained.mp4`,`${a}/${post}/../other.mp4`])
    assert.throws(()=>checkPlan({...mediaSmokePlan(),fixtures:{...mediaSmokePlan().fixtures,videoPath}}),/MEDIA_BINDING/);
});
test('video smoke stops at unauthorized write success without cleanup or subsequent delete',async()=>{
  const p=mediaSmokePlan(),r=await runSessionChecks(fixture(p,{allowForbidden:true}).client,p);
  assert.equal(r.reason,'UNEXPECTED_WRITE_SUCCESS');assert.equal(r.counts.rest,2);assert.equal(r.checks.foreignMediaDeniedUnchanged,undefined);
});
test('video smoke 401 cannot be mistaken for RLS denial',async()=>{
  const p=mediaSmokePlan(),r=await runSessionChecks(fixture(p,{unauthorized:true}).client,p);
  assert.equal(r.reason,'AUTH_FAILURE_NOT_RLS_PROOF');assert.equal(r.counts.rest,2);
});
test('media readback correlates ordinary post media and actual consumed claim without exporting paths',async()=>{
 const p={...plan(),stage:'media-readback-a',fixtures:{actorA:a,postA:post,videoMediaA:media,videoPath:`${a}/${post}/r2-retained-${media}.mp4`}};
 const r=await runSessionChecks(fixture(p).client,p);assert.equal(r.status,'PASS');assert.deepEqual(r.counts,{auth:1,rest:3});
 assert.equal(r.checks.retainedVideoAndClaimConsistent,true);assert(!JSON.stringify(r).includes('r2-retained'));
});
test('media readback rejects a tmp or mismatched reference rather than accepting HTTP status',async()=>{
 const p={...plan(),stage:'media-readback-a',fixtures:{actorA:a,postA:post,videoMediaA:media,videoPath:'tmp/not-retained.mp4'}};
 assert.equal((await runSessionChecks(fixture(p).client,p)).reason,'MEDIA_BINDING_MISMATCH');
});

const freshActor = '66666666-6666-4666-8666-666666666666';
const bannedB4 = '77777777-7777-4777-8777-777777777777';
const freshCircle = '88888888-8888-4888-8888-888888888888';
function freshForeignPlan() {
  const project = 'xcbnxzjlsvtgzixurcof', binding = 'b'.repeat(64);
  const expected = { project, binding, id: freshActor, email: 'PRIVATE_FRESH_MAILBOX@example.org',
    namespace: 'ogh-core-ordinary-fresh-20261027-nonsecret-fixture', createdAt: '2026-10-27T01:00:00Z' };
  return { project, origin: 'https://openglasshub.ogh.workers.dev', binding, expected,
    source: { verified: true, binding, project, origin: 'https://openglasshub.ogh.workers.dev', commit: 'c'.repeat(40), sha256: 'd'.repeat(64) },
    journal: { verified: true, sha256: 'e'.repeat(64), project, binding, namespace: expected.namespace,
      email: expected.email, actorId: freshActor, createdAt: expected.createdAt, submitCount: 1, method: 'NORMAL_OWNER_WEBSITE_SIGNUP' },
    absence: { verified: true, sha256: 'f'.repeat(64), project, binding, email: expected.email, matches: 0 },
    excludedBannedIds: { A3: a, B3: b, B4: bannedB4 },
    foreignFixture: { verified: true, sha256: '1'.repeat(64), binding, sourceSha256: 'd'.repeat(64),
      authorId: a, postId: post, mediaId: media, circleId: freshCircle, namespace, storagePath: `${a}/${post}/PRIVATE_FOREIGN_VIDEO.mp4` },
    deadlineUTC: new Date(Date.now() + 60000).toISOString() };
}
function freshForeignFixture(p, options = {}) {
  const trace = [];
  const rows = {
    profiles: [{ id: freshActor, role: options.role ?? 'user' }],
    posts: [{ id: post, author_id: a, body: `${namespace} PRIVATE_FOREIGN_BODY`, circle_id: freshCircle,
      status: options.pending ? 'pending' : 'published', moderation_status: options.pending ? 'pending_review' : 'published',
      circles: { id: freshCircle, slug: options.hiddenCircle ? 'rls-test-circle' : 'qa-public', name: 'QA public', status: 'active' } }],
    post_media: [{ id: media, post_id: post, user_id: a, kind: 'video', storage_path: p.foreignFixture.storagePath }],
  };
  let authIndex = 0, mutations = 0;
  const user = { id: freshActor, email: p.expected.email, created_at: p.expected.createdAt, email_confirmed_at: '2026-10-27T01:00:01Z' };
  const auth = async method => {
    trace.push({ type: 'auth', method });
    const index = authIndex++;
    return { data: { user: { ...user, ...(options.wrongIdentityAt === index ? { id: a } : {}),
      ...(options.unconfirmed ? { email_confirmed_at: null } : {}) } }, error: null };
  };
  const client = { supabaseUrl: `https://${p.project}.supabase.co`,
    auth: { getUser: () => auth('getUser'), refreshSession: () => auth('refreshSession') },
    from(table) {
      let mode = 'select', filters = [], columns;
      const q = {
        select(value) { columns = value; return q; }, eq(key, value) { filters.push([key, value]); return q; },
        limit() { return q; }, update() { mode = 'update'; return q; }, delete() { mode = 'delete'; return q; },
        then(resolve, reject) {
          trace.push({ type: 'rest', table, mode, filters: structuredClone(filters), columns });
          const selected = rows[table].filter(row => filters.every(([key, value]) => row[key] === value));
          let response;
          if (mode === 'select') {
            const result = structuredClone(options.missingTable === table ? [] : selected);
            if (mutations === (options.changedPostAt ?? 1) && table === 'posts' && options.changedPostField) result[0][options.changedPostField] = 'PRIVATE_CHANGED';
            if (mutations === 3 && table === 'post_media' && options.changedMediaField) result[0][options.changedMediaField] = 'PRIVATE_CHANGED';
            response = { status: 200, data: result, error: null };
          } else {
            mutations++;
            response = options.mutationResponse ?? { status: 200, data: [], error: null };
          }
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const worker = async (url, init) => {
    trace.push({ type: 'worker', url, method: init.method });
    return { status: options.workerStatuses?.[trace.filter(x => x.type === 'worker').length - 1]
      ?? options.workerStatus ?? 403, body: 'PRIVATE_WORKER_BODY' };
  };
  return { client, worker, trace };
}
const freshTestName = 'fresh-one-actor foreign isolation';

for (const [label, mutationResponse] of [
  ['empty', { status: 200, data: [], error: null }],
  ['403', { status: 403, error: { message: 'PRIVATE_ERROR' } }],
  ['42501', { status: 400, error: { code: '42501', message: 'PRIVATE_ERROR' } }],
]) test(`${freshTestName}: valid ${label} denial with exact readbacks and caps`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { mutationResponse });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.counts, { auth: 3, rest: 9, worker: 2 });
  assert.deepEqual(f.trace.filter(x => x.type === 'auth').map(x => x.method), ['getUser', 'refreshSession', 'getUser']);
  assert.deepEqual(f.trace.filter(x => x.type === 'worker'), [
    { type: 'worker', url: p.origin + '/api/admin/forum/me', method: 'GET' },
    { type: 'worker', url: p.origin + '/api/admin/devices', method: 'GET' },
  ]);
  const writes = f.trace.filter(x => x.type === 'rest' && x.mode !== 'select');
  assert.deepEqual(writes.map(x => [x.table, x.mode]), [['posts', 'update'], ['posts', 'delete'], ['post_media', 'delete']]);
  assert.deepEqual(writes.map(x => x.filters), [
    [['id', post], ['author_id', a]], [['id', post], ['author_id', a]], [['id', media], ['user_id', a]],
  ]);
  assert.equal(r.productionAuthority, false);
  const serialized = JSON.stringify(r);
  for (const value of ['PRIVATE_', p.expected.email, freshActor, a, post, media, p.binding, p.foreignFixture.storagePath])
    assert.ok(!serialized.includes(value));
});

test(`${freshTestName}: rejects invalid source journal fixture target and banned actor before calls`, async () => {
  const changes = [
    p => { p.project = 'other'; }, p => { p.origin += '/other'; },
    p => { p.source.verified = false; }, p => { p.source.sha256 = 'bad'; }, p => { p.source.commit = 'bad'; },
    p => { p.source.binding = '0'.repeat(64); },
    p => { p.journal.actorId = a; }, p => { p.journal.submitCount = 2; }, p => { p.absence.matches = 1; },
    p => { p.foreignFixture.sourceSha256 = '0'.repeat(64); }, p => { p.foreignFixture.mediaId = 'bad'; },
    p => { p.foreignFixture.binding = '0'.repeat(64); }, p => { p.foreignFixture.storagePath = `${a}/${post}/../other.mp4`; },
    p => { p.expected.id = a; }, p => { p.expected.id = b; }, p => { p.expected.id = bannedB4; },
    p => { delete p.excludedBannedIds.B4; }, p => { p.deadlineUTC = '2020-01-01T00:00:00Z'; },
  ];
  for (const change of changes) {
    const p = freshForeignPlan(); change(p);
    const f = freshForeignFixture(p), r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
    assert.equal(r.status, 'BLOCKED'); assert.equal(f.trace.length, 0);
    assert.deepEqual(r.counts, { auth: 0, rest: 0, worker: 0 });
  }
  const p = freshForeignPlan(), f = freshForeignFixture(p);
  f.client.supabaseUrl = 'https://other.supabase.co';
  assert.equal((await runFreshOneActorForeignIsolation(f.client, p, f.worker)).reason, 'CLIENT_PROJECT_MISMATCH');
  assert.equal(f.trace.length, 0);
});

for (const options of [{ pending: true }, { hiddenCircle: true }, { missingTable: 'posts' }, { missingTable: 'post_media' }])
  test(`${freshTestName}: missing public visibility ${JSON.stringify(options)} stops before mutation`, async () => {
    const p = freshForeignPlan(), f = freshForeignFixture(p, options);
    const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
    assert.equal(r.status, 'BLOCKED'); assert.equal(r.counts.auth, 3); assert.equal(r.counts.worker, 0);
    assert.ok(!f.trace.some(x => x.mode === 'update' || x.mode === 'delete'));
  });

for (const [label, mutationResponse, reason] of [
  ['success', { status: 200, data: [{ id: post }] }, 'UNEXPECTED_WRITE_SUCCESS'],
  ['contradictory403', { status: 403, data: [{ id: post }] }, 'UNEXPECTED_WRITE_SUCCESS'],
  ['401', { status: 401, error: { code: '42501', status: 401 } }, 'AUTH_FAILURE_NOT_RLS_PROOF'],
  ['missing representation', { status: 204, data: null }, 'DENIAL_UNCONFIRMED'],
]) test(`${freshTestName}: ${label} stops without subsequent write`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { mutationResponse });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.reason, reason); assert.equal(r.counts.rest, 4); assert.equal(r.counts.worker, 0);
  assert.equal(f.trace.filter(x => x.mode === 'update' || x.mode === 'delete').length, 1);
});

for (const changedPostField of ['id', 'author_id', 'body', 'circle_id', 'status', 'moderation_status'])
  test(`${freshTestName}: unchanged post ${changedPostField} is mandatory`, async () => {
    const p = freshForeignPlan(), f = freshForeignFixture(p, { changedPostField });
    const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
    assert.equal(r.reason, 'FOREIGN_POST_CHANGED'); assert.equal(r.counts.rest, 5); assert.equal(r.counts.worker, 0);
  });
for (const changedMediaField of ['id', 'post_id', 'user_id', 'kind', 'storage_path'])
  test(`${freshTestName}: unchanged media ${changedMediaField} is mandatory`, async () => {
    const p = freshForeignPlan(), f = freshForeignFixture(p, { changedMediaField });
    const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
    assert.equal(r.reason, 'FOREIGN_MEDIA_CHANGED'); assert.equal(r.counts.rest, 9); assert.equal(r.counts.worker, 0);
  });

for (const wrongIdentityAt of [0, 1, 2]) test(`${freshTestName}: identity mismatch at Auth ${wrongIdentityAt + 1}`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { wrongIdentityAt });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.reason, 'SESSION_IDENTITY_MISMATCH'); assert.equal(r.counts.auth, wrongIdentityAt + 1);
  assert.ok(r.counts.rest <= 1); assert.equal(r.counts.worker, 0);
});
for (const role of ['admin', 'moderator']) test(`${freshTestName}: ${role} is not ordinary`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { role });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.reason, 'ORDINARY_PROFILE_NOT_PROVEN'); assert.deepEqual(r.counts, { auth: 1, rest: 1, worker: 0 });
});
for (const workerStatus of [200, 401, 500]) test(`${freshTestName}: Worker ${workerStatus} cannot prove admin denial`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { workerStatus });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.reason, workerStatus === 401 ? 'AUTH_FAILURE_NOT_RLS_PROOF' : 'ADMIN_ACCESS_NOT_DENIED');
  assert.deepEqual(r.counts, { auth: 3, rest: 9, worker: 1 });
});

test(`${freshTestName}: 8s timeout is UNKNOWN with no retry or late continuation`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p); let finish;
  f.client.auth.getUser = () => { f.trace.push({ type: 'auth', method: 'pending' }); return new Promise(resolve => { finish = resolve; }); };
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.status, 'UNKNOWN'); assert.equal(r.reason, 'REQUEST_COMPLETION_UNKNOWN');
  assert.deepEqual(r.counts, { auth: 1, rest: 0, worker: 0 }); assert.equal(r.outstandingCompletion, 'UNKNOWN');
  finish({ data: { user: { id: freshActor } } }); await Promise.resolve();
  assert.equal(f.trace.length, 1); assert.equal(r.status, 'UNKNOWN');
});

test(`${freshTestName}: arbitrary exception stays value blind and stops`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p);
  f.client.auth.getUser = () => { throw Error('PRIVATE_EXCEPTION'); };
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.status, 'UNKNOWN'); assert.equal(r.reason, 'UNKNOWN');
  assert.deepEqual(r.counts, { auth: 1, rest: 0, worker: 0 }); assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});

test(`${freshTestName}: second post denial also requires unchanged readback`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { changedPostField: 'body', changedPostAt: 2 });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.reason, 'FOREIGN_POST_CHANGED'); assert.deepEqual(r.counts, { auth: 3, rest: 7, worker: 0 });
});

test(`${freshTestName}: second Worker denial is mandatory`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { workerStatuses: [403, 200] });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.reason, 'ADMIN_ACCESS_NOT_DENIED'); assert.deepEqual(r.counts, { auth: 3, rest: 9, worker: 2 });
});

test(`${freshTestName}: unconfirmed email stops before profile or refresh`, async () => {
  const p = freshForeignPlan(), f = freshForeignFixture(p, { unconfirmed: true });
  const r = await runFreshOneActorForeignIsolation(f.client, p, f.worker);
  assert.equal(r.reason, 'EMAIL_CONFIRMATION_UNKNOWN'); assert.deepEqual(r.counts, { auth: 1, rest: 0, worker: 0 });
});
