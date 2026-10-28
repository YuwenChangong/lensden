import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { checkPlan, runSessionChecks, buildOwnerSnippet, runFreshOneActorForeignIsolation } from './core-ordinary-session-checks.mjs';
import * as ordinaryChecks from './core-ordinary-session-checks.mjs';

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
  const actorId = options.actorId ?? freshActor;
  const foreignAuthor = options.foreignAuthorId ?? a;
  const foreignNamespace = options.foreignNamespace ?? namespace;
  const rows = {
    profiles: [{ id: actorId, role: options.role ?? 'user' }],
    posts: [{ id: post, author_id: foreignAuthor, body: `${foreignNamespace} PRIVATE_FOREIGN_BODY`, circle_id: freshCircle,
      status: options.pending ? 'pending' : 'published', moderation_status: options.pending ? 'pending_review' : 'published',
      circles: { id: freshCircle, slug: options.hiddenCircle ? 'rls-test-circle' : 'qa-public', name: 'QA public', status: 'active' } }],
    post_media: [{ id: media, post_id: post, user_id: foreignAuthor, kind: 'video', storage_path: p.foreignFixture.storagePath }],
  };
  let authIndex = 0, mutations = 0;
  const user = { id: actorId, role: options.authRole ?? 'authenticated', email: p.expected.email,
    created_at: p.expected.createdAt, email_confirmed_at: '2026-10-27T01:00:01Z' };
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

const twoFreshTestName = 'two-fresh ordinary isolation';
const freshOwner = '99999999-9999-4999-8999-999999999999';
function twoFreshPlan() {
  const p = freshForeignPlan();
  const expected = { ...p.expected, id: freshOwner, email: 'PRIVATE_OWNER_MAILBOX@example.org',
    namespace: 'ogh-core-ordinary-owner-20261027-nonsecret-fixture' };
  const journal = { ...p.journal, actorId: freshOwner, email: expected.email, namespace: expected.namespace, sha256: '2'.repeat(64) };
  const absence = { ...p.absence, email: expected.email, sha256: '3'.repeat(64) };
  const session = (actor, j, context) => ({ verified: true, sha256: context.repeat(64), binding: p.binding,
    project: p.project, origin: p.origin, sourceSha256: p.source.sha256, actorId: actor.id,
    journalSha256: j.sha256, sessionContextSha256: context.repeat(64), observedAtUTC: '2026-10-27T01:00:02Z',
    authRole: 'authenticated', provenance: 'NORMAL_WEBSITE_SESSION' });
  p.owner = { expected, journal, absence, sessionReceipt: session(expected, journal, '4') };
  p.sessionReceipt = session(p.expected, p.journal, '5');
  p.foreignFixture = { ...p.foreignFixture, authorId: freshOwner, namespace: expected.namespace,
    creatorJournalSha256: journal.sha256, storagePath: `${freshOwner}/${post}/PRIVATE_RETAINED_VIDEO.mp4` };
  return p;
}
function twoFreshFixture(p, options = {}) {
  const target = { foreignAuthorId: freshOwner, foreignNamespace: p.owner.expected.namespace };
  const owner = freshForeignFixture({ ...p, ...p.owner }, { ...target, actorId: freshOwner, ...options.owner });
  const other = freshForeignFixture(p, { ...target, ...options.other });
  return { owner, other, run: () => ordinaryChecks.runTwoFreshOrdinaryForeignIsolation(owner.client, other.client, p, other.worker) };
}

function postOnlyFixture(options = {}) {
  const p = twoFreshPlan();
  p.acceptanceScope = 'POST_AND_ADMIN_ONLY';
  delete p.foreignFixture.mediaId;
  delete p.foreignFixture.storagePath;
  const f = twoFreshFixture(p, options);
  return { p, ...f, run: () => ordinaryChecks.runTwoFreshOrdinaryPostIsolation(f.owner.client, f.other.client, p, f.other.worker) };
}

function adminProvisionedPostFixture(options = {}) {
  const f = postOnlyFixture(options), p = f.p;
  p.fixtureProvisioningApproval = { verified: true, sha256: 'a'.repeat(64), binding: p.binding,
    project: p.project, method: 'AUTH_ADMIN_CREATE_CONFIRMED_FIXTURE', maximumCreates: 2, maximumEmails: 0 };
  for (const actor of [p, p.owner]) {
    actor.journal.method = 'AUTH_ADMIN_CREATE_CONFIRMED_FIXTURE';
    Object.assign(actor.journal, { createStatus: 200, requestShapeVerified: true,
      requestedEmailConfirm: true, requestRoleOrAppMetadataPresent: false, requestPhonePresent: false,
      initialGet: { verified: true, sha256: '6'.repeat(64), binding: p.binding, project: p.project,
        actorId: actor.expected.id, email: actor.expected.email, createdAt: actor.expected.createdAt,
        namespace: actor.expected.namespace, authRole: 'authenticated', emailConfirmed: true } });
  }
  for (const [actor, client] of [[p, f.other.client], [p.owner, f.owner.client]]) {
    for (const method of ['getUser', 'refreshSession']) {
      const original = client.auth[method];
      client.auth[method] = async () => {
        const r = await original();
        r.data.user.user_metadata = { qa_namespace: actor.expected.namespace };
        return r;
      };
    }
  }
  return { ...f, runAdmin: () => ordinaryChecks.runTwoAdminFixturePostIsolation(
    f.owner.client, f.other.client, p, f.other.worker) };
}

test('B1 admin-fixture: separate truthful provenance and exact post-only caps', async () => {
  const f = adminProvisionedPostFixture(), r = await f.runAdmin();
  assert.equal(r.status, 'PASS');
  assert.equal(r.identityProvisioning, 'AUTH_ADMIN_CREATE_CONFIRMED_FIXTURE');
  assert.equal(r.mediaIsolation, 'NOT_VERIFIED');
  assert.deepEqual(r.counts, { auth: 6, rest: 8, worker: 2 });
  assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
  assert.equal(r.productionAuthority, false);
});

test('B1 admin-fixture: normal entry cannot accept admin journals or relabelled signups', async () => {
  const f = adminProvisionedPostFixture();
  assert.equal((await f.run()).reason, 'JOURNAL_BINDING_INVALID');
  assert.equal(f.owner.trace.length + f.other.trace.length, 0);
  const g = postOnlyFixture();
  const r = await ordinaryChecks.runTwoAdminFixturePostIsolation(g.owner.client, g.other.client, g.p, g.other.worker);
  assert.equal(r.status, 'BLOCKED');
  assert.equal(g.owner.trace.length + g.other.trace.length, 0);
});

test('B1 admin-fixture: exact approval and independent create readback required before calls', async () => {
  for (const change of [
    p => { p.fixtureProvisioningApproval.verified = false; },
    p => { p.fixtureProvisioningApproval.binding = '0'.repeat(64); },
    p => { p.fixtureProvisioningApproval.maximumCreates = 3; },
    p => { p.fixtureProvisioningApproval.maximumEmails = 1; },
    p => { p.owner.journal.method = 'NORMAL_OWNER_WEBSITE_SIGNUP'; },
    p => { p.journal.createStatus = 201; },
    p => { p.journal.requestShapeVerified = false; },
    p => { p.journal.requestedEmailConfirm = false; },
    p => { p.journal.requestRoleOrAppMetadataPresent = true; },
    p => { p.journal.requestPhonePresent = true; },
    p => { p.journal.initialGet.actorId = freshOwner; },
    p => { p.journal.initialGet.binding = '0'.repeat(64); },
    p => { p.journal.initialGet.emailConfirmed = false; },
    p => { p.journal.initialGet.authRole = 'service_role'; },
    p => { p.journal.initialGet.namespace += '-wrong'; },
    p => { p.journal.initialGet.createdAt = '2020-01-01T00:00:00Z'; },
  ]) {
    const f = adminProvisionedPostFixture(); change(f.p);
    assert.equal((await f.runAdmin()).status, 'BLOCKED');
    assert.equal(f.owner.trace.length + f.other.trace.length, 0);
  }
});

for (const [label, options, reason] of [
  ['staff profile', { other: { role: 'moderator' } }, 'ORDINARY_PROFILE_NOT_PROVEN'],
  ['service client', { other: { authRole: 'service_role' } }, 'SESSION_IDENTITY_MISMATCH'],
  ['unconfirmed', { owner: { unconfirmed: true } }, 'EMAIL_CONFIRMATION_UNKNOWN'],
  ['401', { other: { mutationResponse: { status: 401, error: { code: '42501' } } } }, 'AUTH_FAILURE_NOT_RLS_PROOF'],
  ['write success', { other: { mutationResponse: { status: 200, data: [{ id: post }] } } }, 'UNEXPECTED_WRITE_SUCCESS'],
  ['changed post', { other: { changedPostField: 'body' } }, 'FOREIGN_POST_CHANGED'],
  ['admin allowed', { other: { workerStatus: 200 } }, 'ADMIN_ACCESS_NOT_DENIED'],
]) test(`B1 admin-fixture: ${label} remains fail closed`, async () => {
  const f = adminProvisionedPostFixture(options), r = await f.runAdmin();
  assert.notEqual(r.status, 'PASS'); assert.equal(r.reason, reason);
});

test('B1 admin-fixture: actual server namespace and creation time must match', async () => {
  for (const [field, value] of [['user_metadata', { qa_namespace: 'wrong' }], ['created_at', '2020-01-01T00:00:00Z']]) {
    const f = adminProvisionedPostFixture(), original = f.owner.client.auth.getUser;
    f.owner.client.auth.getUser = async () => { const r = await original(); r.data.user[field] = value; return r; };
    assert.equal((await f.runAdmin()).reason, 'SESSION_IDENTITY_MISMATCH');
  }
});

test('B1 admin-fixture: earlier historical actors stay excluded before any request', async () => {
  for (const id of ['23c3c903-0687-4c6d-840c-f7f8a0d442db',
    'dce0109d-93ef-4cc7-a91f-4085855410c9', '6dab7393-d551-4690-9964-841cfe0c19a4']) {
    for (const owner of [false, true]) {
      const f = adminProvisionedPostFixture(), actor = owner ? f.p.owner : f.p;
      actor.expected.id = actor.journal.actorId = actor.journal.initialGet.actorId = actor.sessionReceipt.actorId = id;
      if (owner) f.p.foreignFixture.authorId = id;
      assert.equal((await f.runAdmin()).status, 'BLOCKED');
      assert.equal(f.owner.trace.length + f.other.trace.length, 0);
    }
  }
});

test('B1 post-only: exact foreign post denials without any media operation or media PASS', async () => {
  const f = postOnlyFixture(), r = await f.run();
  assert.equal(r.status, 'PASS');
  assert.equal(r.acceptanceScope, 'POST_AND_ADMIN_ONLY');
  assert.equal(r.mediaIsolation, 'NOT_VERIFIED');
  assert.deepEqual(r.counts, { auth: 6, rest: 8, worker: 2 });
  assert.equal(r.checks.foreignPostUpdateDeniedUnchanged, true);
  assert.equal(r.checks.foreignPostDeleteDeniedUnchanged, true);
  assert.equal(r.checks.ordinaryStaffAndAdminDenied, true);
  assert.equal(r.checks.foreignMediaDeleteDeniedUnchanged, undefined);
  assert.ok(![...f.owner.trace, ...f.other.trace].some(x => x.table === 'post_media'));
  assert.deepEqual(f.other.trace.filter(x => ['update', 'delete'].includes(x.mode)).map(x => [x.table, x.mode]),
    [['posts', 'update'], ['posts', 'delete']]);
  for (const value of ['PRIVATE_', freshOwner, freshActor, post, f.p.binding]) assert.ok(!JSON.stringify(r).includes(value));
});

test('B1 post-only: explicit narrow scope and media-free fixture are mandatory', async () => {
  for (const change of [p => { delete p.acceptanceScope; }, p => { p.acceptanceScope = 'FULL'; },
    p => { p.foreignFixture.mediaId = media; }, p => { p.foreignFixture.storagePath = 'PRIVATE_PATH'; },
    p => { p.owner.journal.verified = false; }, p => { p.expected.id = a; },
    p => { p.sessionReceipt.authRole = 'service_role'; }]) {
    const f = postOnlyFixture(); change(f.p);
    const r = await f.run(); assert.equal(r.status, 'BLOCKED');
    assert.equal(f.owner.trace.length + f.other.trace.length, 0);
  }
});

for (const [label, options, reason] of [
  ['pending post', { owner: { pending: true } }, 'PUBLIC_FIXTURE_NOT_VISIBLE'],
  ['nonordinary user', { other: { role: 'moderator' } }, 'ORDINARY_PROFILE_NOT_PROVEN'],
  ['401', { other: { mutationResponse: { status: 401, error: { code: '42501' } } } }, 'AUTH_FAILURE_NOT_RLS_PROOF'],
  ['unexpected mutation', { other: { mutationResponse: { status: 200, data: [{ id: post }] } } }, 'UNEXPECTED_WRITE_SUCCESS'],
  ['changed body', { other: { changedPostField: 'body' } }, 'FOREIGN_POST_CHANGED'],
  ['changed post after delete', { other: { changedPostField: 'body', changedPostAt: 2 } }, 'FOREIGN_POST_CHANGED'],
  ['Worker200', { other: { workerStatus: 200 } }, 'ADMIN_ACCESS_NOT_DENIED'],
]) test(`B1 post-only: ${label} never produces isolation PASS`, async () => {
  const f = postOnlyFixture(options), r = await f.run();
  assert.equal(r.reason, reason); assert.notEqual(r.status, 'PASS');
  assert.equal(r.mediaIsolation, 'NOT_VERIFIED');
  assert.ok(r.counts.auth <= 6 && r.counts.rest <= 8 && r.counts.worker <= 2);
});

test('B1 post-only: old full-media entry cannot silently skip its media gate', async () => {
  const f = postOnlyFixture();
  const r = await ordinaryChecks.runTwoFreshOrdinaryForeignIsolation(f.owner.client, f.other.client, f.p, f.other.worker);
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.reason, 'FIXTURE_BINDING_INVALID');
  assert.equal(f.owner.trace.length + f.other.trace.length, 0);
});

test(`${twoFreshTestName}: owner and other both authenticate before exact foreign writes`, async () => {
  assert.equal(typeof ordinaryChecks.runTwoFreshOrdinaryForeignIsolation, 'function');
  const p = twoFreshPlan(), f = twoFreshFixture(p), r = await f.run();
  assert.equal(r.status, 'PASS'); assert.deepEqual(r.counts, { auth: 6, rest: 12, worker: 2 });
  for (const actor of [f.owner, f.other])
    assert.deepEqual(actor.trace.filter(x => x.type === 'auth').map(x => x.method), ['getUser', 'refreshSession', 'getUser']);
  assert.deepEqual(f.owner.trace.filter(x => x.type === 'rest').map(x => [x.table, x.mode]),
    [['profiles', 'select'], ['posts', 'select'], ['post_media', 'select']]);
  const writes = f.other.trace.filter(x => x.type === 'rest' && x.mode !== 'select');
  assert.deepEqual(writes.map(x => [x.table, x.mode, x.filters]), [
    ['posts', 'update', [['id', post], ['author_id', freshOwner]]],
    ['posts', 'delete', [['id', post], ['author_id', freshOwner]]],
    ['post_media', 'delete', [['id', media], ['user_id', freshOwner]]],
  ]);
  assert.equal(r.checks.twoFreshOrdinaryIdentities, true); assert.equal(r.checks.ownerFixtureReadback, true);
  assert.equal(r.productionAuthority, false);
  for (const value of ['PRIVATE_', freshOwner, freshActor, post, media, p.binding]) assert.ok(!JSON.stringify(r).includes(value));
});

test(`${twoFreshTestName}: rejects stale banned duplicate or unbound participants before dispatch`, async () => {
  const changes = [
    p => { delete p.owner; }, p => { p.owner.expected.id = p.expected.id; },
    p => { p.owner.expected.id = a; }, p => { p.owner.expected.id = b; }, p => { p.owner.expected.id = bannedB4; },
    p => { p.expected.id = a; }, p => { p.expected.id = b; }, p => { p.expected.id = bannedB4; },
    p => { p.owner.expected.email = p.expected.email; }, p => { p.owner.expected.binding = '0'.repeat(64); },
    p => { p.owner.journal.verified = false; }, p => { p.owner.journal.actorId = freshActor; },
    p => { p.owner.absence.matches = 1; }, p => { p.owner.absence.binding = '0'.repeat(64); },
    p => { p.source.binding = '0'.repeat(64); }, p => { p.source.origin += '/wrong'; },
    p => { delete p.sessionReceipt; }, p => { p.owner.sessionReceipt.verified = false; },
    p => { p.owner.sessionReceipt.actorId = freshActor; }, p => { p.sessionReceipt.actorId = freshOwner; },
    p => { p.owner.sessionReceipt.sourceSha256 = '0'.repeat(64); },
    p => { p.sessionReceipt.journalSha256 = '0'.repeat(64); },
    p => { p.sessionReceipt.sessionContextSha256 = p.owner.sessionReceipt.sessionContextSha256; },
    p => { p.owner.sessionReceipt.observedAtUTC = '2020-01-01T00:00:00Z'; },
    p => { p.foreignFixture.authorId = a; }, p => { p.foreignFixture.postId = 'invalid'; },
    p => { p.foreignFixture.creatorJournalSha256 = '0'.repeat(64); },
    p => { p.foreignFixture.namespace = namespace; },
    p => { p.deadlineUTC = '2020-01-01T00:00:00Z'; },
  ];
  for (const change of changes) {
    const p = twoFreshPlan(), f = twoFreshFixture(p); change(p);
    const r = await f.run(); assert.equal(r.status, 'BLOCKED');
    assert.deepEqual(r.counts, { auth: 0, rest: 0, worker: 0 });
    assert.equal(f.owner.trace.length + f.other.trace.length, 0);
  }
});

for (const participant of ['owner', 'other']) {
  test(`${twoFreshTestName}: ${participant} live identity mismatch blocks business`, async () => {
    const p = twoFreshPlan(), f = twoFreshFixture(p, { [participant]: { wrongIdentityAt: 1 } }), r = await f.run();
    assert.equal(r.reason, 'SESSION_IDENTITY_MISMATCH');
    assert.ok(![...f.owner.trace, ...f.other.trace].some(x => ['update', 'delete'].includes(x.mode)));
  });
  test(`${twoFreshTestName}: ${participant} live privileged role blocks business`, async () => {
    const p = twoFreshPlan(), f = twoFreshFixture(p, { [participant]: { role: 'admin' } }), r = await f.run();
    assert.equal(r.reason, 'ORDINARY_PROFILE_NOT_PROVEN');
    assert.ok(!f.other.trace.some(x => ['update', 'delete'].includes(x.mode)));
  });
}
test(`${twoFreshTestName}: either client on another project stops before dispatch`, async () => {
  for (const participant of ['owner', 'other']) {
    const p = twoFreshPlan(), f = twoFreshFixture(p); f[participant].client.supabaseUrl = 'https://other.supabase.co';
    const r = await f.run(); assert.equal(r.reason, 'CLIENT_PROJECT_MISMATCH');
    assert.equal(f.owner.trace.length + f.other.trace.length, 0);
  }
});
test(`${twoFreshTestName}: owner cannot be the same client object as other`, async () => {
  const p = twoFreshPlan(), f = twoFreshFixture(p);
  const r = await ordinaryChecks.runTwoFreshOrdinaryForeignIsolation(f.owner.client, f.owner.client, p, f.other.worker);
  assert.equal(r.status, 'BLOCKED'); assert.equal(f.owner.trace.length, 0);
});

for (const participant of ['owner', 'other']) test(`${twoFreshTestName}: ${participant} must see exact public fixture`, async () => {
  const p = twoFreshPlan(), f = twoFreshFixture(p, { [participant]: { pending: true } }), r = await f.run();
  assert.equal(r.status, 'BLOCKED');
  assert.ok(!f.other.trace.some(x => ['update', 'delete'].includes(x.mode)));
});
test(`${twoFreshTestName}: owner and foreign readback bodies must match`, async () => {
  const p = twoFreshPlan(), f = twoFreshFixture(p);
  const original = f.owner.client.from;
  f.owner.client.from = table => {
    const query = original(table), then = query.then;
    query.then = (resolve, reject) => then.call(query, response => {
      if (table === 'posts') response.data[0].body += ' PRIVATE_DIFFERENT';
      resolve(response);
    }, reject);
    return query;
  };
  const r = await f.run(); assert.equal(r.reason, 'FIXTURE_BINDING_INVALID');
  assert.ok(!f.other.trace.some(x => ['update', 'delete'].includes(x.mode)));
});

for (const [label, options, reason] of [
  ['401', { mutationResponse: { status: 401, error: { code: '42501' } } }, 'AUTH_FAILURE_NOT_RLS_PROOF'],
  ['unexpected write', { mutationResponse: { status: 200, data: [{ id: post }] } }, 'UNEXPECTED_WRITE_SUCCESS'],
  ['changed post', { changedPostField: 'body' }, 'FOREIGN_POST_CHANGED'],
  ['changed media parent', { changedMediaField: 'post_id' }, 'FOREIGN_MEDIA_CHANGED'],
  ['Worker401', { workerStatus: 401 }, 'AUTH_FAILURE_NOT_RLS_PROOF'],
  ['Worker200', { workerStatus: 200 }, 'ADMIN_ACCESS_NOT_DENIED'],
]) test(`${twoFreshTestName}: ${label} is not isolation proof`, async () => {
  const p = twoFreshPlan(), f = twoFreshFixture(p, { other: options }), r = await f.run();
  assert.equal(r.reason, reason); assert.notEqual(r.status, 'PASS');
  assert.ok(r.counts.auth <= 6 && r.counts.rest <= 12 && r.counts.worker <= 2);
});

test(`${twoFreshTestName}: timeout in owner leaves no other calls or late continuation`, async () => {
  const p = twoFreshPlan(), f = twoFreshFixture(p); let finish;
  f.owner.client.auth.getUser = () => new Promise(resolve => { finish = resolve; });
  const r = await f.run(); assert.equal(r.status, 'UNKNOWN'); assert.equal(r.reason, 'REQUEST_COMPLETION_UNKNOWN');
  assert.deepEqual(r.counts, { auth: 1, rest: 0, worker: 0 });
  finish({ data: { user: { id: freshOwner } } }); await Promise.resolve();
  assert.equal(f.other.trace.length, 0); assert.equal(r.status, 'UNKNOWN');
});

test(`${twoFreshTestName}: old one-actor entry still rejects a fresh fixture owner`, async () => {
  const p = twoFreshPlan(), f = twoFreshFixture(p);
  const r = await runFreshOneActorForeignIsolation(f.other.client, p, f.other.worker);
  assert.equal(r.reason, 'FIXTURE_BINDING_INVALID'); assert.equal(f.other.trace.length, 0);
});

for (const participant of ['owner', 'other']) {
  test(`${twoFreshTestName}: ${participant} nonordinary receipt is rejected before dispatch`, async () => {
    for (const change of [r => { r.authRole = 'service_role'; }, r => { delete r.provenance; }]) {
      const p = twoFreshPlan(), f = twoFreshFixture(p);
      change(participant === 'owner' ? p.owner.sessionReceipt : p.sessionReceipt);
      const r = await f.run(); assert.equal(r.reason, 'SESSION_BINDING_INVALID');
      assert.deepEqual(r.counts, { auth: 0, rest: 0, worker: 0 });
      assert.equal(f.owner.trace.length + f.other.trace.length, 0);
    }
  });
  test(`${twoFreshTestName}: ${participant} live service role is not ordinary proof`, async () => {
    const p = twoFreshPlan(), f = twoFreshFixture(p, { [participant]: { authRole: 'service_role' } });
    const r = await f.run(); assert.equal(r.reason, 'SESSION_IDENTITY_MISMATCH');
    assert.ok(!f.other.trace.some(x => ['update', 'delete'].includes(x.mode)));
  });
}
