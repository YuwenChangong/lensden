// Post-login owner-operated checks only. This module cannot log in or grant consent.
import { authEvidence, ordinarySignupIdentityEvidence } from './core-auth-admission-v2.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const origin = 'https://openglasshub.ogh.workers.dev';
const asset = '/_astro/supabase-browser.CbJzQpCJ.js';

export function checkPlan(p, now = Date.now()) {
  const require = (ok, reason) => { if (!ok) throw new Error(reason); };
  require(p && /^[a-f0-9]{64}$/.test(p.binding), 'BINDING_INVALID');
  require(/^ogh-core-ordinary-[a-z0-9-]{20,100}$/.test(p.namespace), 'NAMESPACE_INVALID');
  const freshBinding = p.stage === 'bind-auth';
  require(p.journalVerified === true && (freshBinding
    ? p.actorId === undefined && /^[a-f0-9]{64}$/.test(p.priorAliasAbsenceSha256 ?? '')
    : uuid.test(p.actorId)), 'CREATE_JOURNAL_REQUIRED');
  if (freshBinding) require(typeof p.expectedEmail === 'string', 'PRIVATE_EMAIL_BINDING_INVALID');
  if (p.expectedEmail !== undefined) require(typeof p.expectedEmail === 'string'
    && /^[^\s@]+\+ogh-(a3|b3)-[a-f0-9]{16}@gmail\.com$/.test(p.expectedEmail), 'PRIVATE_EMAIL_BINDING_INVALID');
  require(['A3', 'B3'].includes(p.actor), 'ACTOR_INVALID');
  require(['bind-auth', 'auth', 'media-readback-a', 'rls-a', 'rls-b', 'smoke-rls-b', 'smoke-media-rls-b', 'logout'].includes(p.stage), 'STAGE_INVALID');
  require(typeof p.deadlineUTC === 'string' && Number.isFinite(Date.parse(p.deadlineUTC))
    && now < Date.parse(p.deadlineUTC), 'DEADLINE_INVALID');
  if (p.stage.includes('rls')) {
    const f = p.fixtures;
    const keys = p.stage === 'smoke-media-rls-b' ? ['actorA', 'actorB', 'postA', 'videoMediaA']
      : p.stage === 'smoke-rls-b' ? ['actorA', 'actorB', 'postA'] : ['actorA', 'actorB', 'postA', 'commentB', 'imageMediaA'];
    require(f && keys.every(k => uuid.test(f[k])), 'FIXTURE_INVALID');
    require(f.actorA !== f.actorB && p.actorId === (p.stage === 'rls-a' ? f.actorA : f.actorB)
      && p.actor === (p.stage === 'rls-a' ? 'A3' : 'B3'), 'FIXTURE_ACTOR_MISMATCH');
    if (p.stage === 'smoke-media-rls-b') require(typeof f.videoPath === 'string'
      && f.videoPath.startsWith(`${f.actorA}/${f.postA}/`) && /^[a-zA-Z0-9/_-]+(?:\.[a-zA-Z0-9]+)?$/.test(f.videoPath)
      && f.videoPath.endsWith('.mp4'), 'MEDIA_BINDING_MISMATCH');
  }
  if (p.stage === 'media-readback-a') require(p.actor === 'A3' && p.actorId === p.fixtures?.actorA
    && ['actorA','postA','videoMediaA'].every(k=>uuid.test(p.fixtures[k])), 'FIXTURE_ACTOR_MISMATCH');
  return p;
}

export async function runSessionChecks(client, p) {
  checkPlan(p);
  const counts = { auth: 0, rest: 0 };
  const checks = {};
  let failure = null;
  let resolvedActorId = p.actorId;
  let providerCreatedAtUTC;
  const insist = (ok, reason) => { if (!ok) throw new Error(reason); };
  async function call(type, operation) {
    insist(Date.now() < Date.parse(p.deadlineUTC), 'DEADLINE_EXPIRED');
    insist(++counts[type] <= (type === 'auth' ? 3 : 12), 'BATCH_BUDGET');
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('REQUEST_COMPLETION_UNKNOWN')), 8000); }),
      ]);
      insist(Date.now() < Date.parse(p.deadlineUTC), 'DEADLINE_EXPIRED');
      return result;
    } finally { clearTimeout(timer); }
  }
  function success(r) {
    if (r?.error) {
      failure = authEvidence({ status: r.error.status, body: r.error, completion: 'CONFIRMED' });
      throw new Error('SDK_ERROR');
    }
    return r?.data;
  }
  async function read(table, columns, id, extra = {}) {
    return success(await call('rest', () => {
      let query = client.from(table).select(columns).eq('id', id);
      for (const [k, v] of Object.entries(extra)) query = query.eq(k, v);
      return query.limit(1);
    }));
  }
  function one(rows) { insist(Array.isArray(rows) && rows.length === 1, 'EXACT_ROW_NOT_VISIBLE'); return rows[0]; }
  async function denied(operation) {
    const r = await call('rest', operation);
    insist(r?.status !== 401 && r?.error?.status !== 401, 'AUTH_FAILURE_NOT_RLS_PROOF');
    const accepted = r?.error?.code === '42501' || r?.status === 403
      || (!r?.error && [200, 204].includes(r?.status) && Array.isArray(r?.data) && r.data.length === 0);
    insist(accepted, Array.isArray(r?.data) && r.data.length ? 'UNEXPECTED_WRITE_SUCCESS' : 'DENIAL_UNCONFIRMED');
  }
  try {
    const user = success(await call('auth', () => client.auth.getUser()))?.user;
    insist(p.stage === 'bind-auth' ? uuid.test(user?.id ?? '') : user?.id === p.actorId, 'SESSION_IDENTITY_MISMATCH');
    insist(p.expectedEmail === undefined || user?.email === p.expectedEmail, 'SESSION_IDENTITY_MISMATCH');
    resolvedActorId = user.id;
    checks.exactAuthenticatedUser = true;
    if (p.stage === 'auth' || p.stage === 'bind-auth') {
      insist(Number.isFinite(Date.parse(user.email_confirmed_at)), 'EMAIL_CONFIRMATION_UNKNOWN');
      const row = one(await read('profiles', 'id,role', resolvedActorId));
      insist(row.id === resolvedActorId && row.role === 'user', 'ORDINARY_PROFILE_NOT_PROVEN');
      checks.ordinaryProfile = checks.confirmedEmail = true;
      if (p.stage === 'bind-auth') {
        insist(typeof user.created_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(user.created_at)
          && Number.isFinite(Date.parse(user.created_at)), 'PROVIDER_CREATION_TIME_UNKNOWN');
        providerCreatedAtUTC = user.created_at;
        checks.freshIdentityBound = true;
      }
      else {
        const refreshed = success(await call('auth', () => client.auth.refreshSession()));
        insist(refreshed?.user?.id === p.actorId, 'REFRESH_IDENTITY_MISMATCH');
        const again = success(await call('auth', () => client.auth.getUser()));
        insist(again?.user?.id === p.actorId, 'REFRESH_READBACK_MISMATCH');
        checks.refreshedIdentity = true;
      }
    } else if (p.stage === 'media-readback-a') {
      const f=p.fixtures;
      const post=one(await read('posts','id,author_id,body,status,moderation_status',f.postA));
      insist(post.author_id===p.actorId && post.body?.includes(p.namespace) && post.status==='published'
        && post.moderation_status==='published','POST_BINDING_MISMATCH');
      const media=one(await read('post_media','id,post_id,user_id,kind,storage_path',f.videoMediaA));
      const claim=one(success(await call('rest',()=>client.from('post_media_r2_copy_claims')
        .select('post_id,user_id,claim_id,mime_type,retained_key').eq('post_id',f.postA).eq('user_id',p.actorId).limit(2))));
      insist(uuid.test(claim.claim_id??'')&&claim.post_id===f.postA&&claim.user_id===p.actorId&&claim.mime_type==='video/mp4'
        &&claim.retained_key===`${p.actorId}/${f.postA}/r2-retained-${claim.claim_id}.mp4`
        &&media.post_id===f.postA&&media.user_id===p.actorId&&media.kind==='video'
        &&media.storage_path===claim.retained_key,'MEDIA_BINDING_MISMATCH');
      checks.publishedOwnPost=checks.retainedVideoAndClaimConsistent=true;
    } else if (p.stage === 'logout') {
      success(await call('auth', () => client.auth.signOut({ scope: 'global' })));
      checks.logoutAcknowledged = true;
    } else {
      const f = p.fixtures;
      const post = one(await read('posts', 'id,author_id,body', f.postA));
      insist(post.author_id === f.actorA && typeof post.body === 'string' && post.body.includes(p.namespace), 'POST_BINDING_MISMATCH');
      if (p.stage === 'rls-a') {
        const body = `${p.namespace} owned-update`;
        const changed = success(await call('rest', () => client.from('posts').update({ body }).eq('id', f.postA).eq('author_id', f.actorA).select('id')));
        insist(Array.isArray(changed) && changed.length === 1 && changed[0].id === f.postA, 'OWN_UPDATE_UNCONFIRMED');
        insist(one(await read('posts', 'id,body', f.postA)).body === body, 'OWN_UPDATE_READBACK');
        const comment = one(await read('comments', 'id,author_id,post_id,body', f.commentB));
        insist(comment.author_id === f.actorB && comment.post_id === f.postA && comment.body.includes(p.namespace), 'COMMENT_BINDING_MISMATCH');
        await denied(() => client.from('comments').update({ body: `${p.namespace} forbidden` }).eq('id', f.commentB).eq('author_id', f.actorB).select('id'));
        insist(one(await read('comments', 'id,body', f.commentB)).body === comment.body, 'FOREIGN_COMMENT_CHANGED');
        checks.ownedUpdate = checks.foreignCommentDeniedUnchanged = true;
      } else {
        await denied(() => client.from('posts').update({ body: `${p.namespace} forbidden` }).eq('id', f.postA).eq('author_id', f.actorA).select('id'));
        insist(one(await read('posts', 'id,body', f.postA)).body === post.body, 'FOREIGN_POST_CHANGED');
        checks.foreignPostDeniedUnchanged = true;
        if (p.stage === 'smoke-rls-b' || p.stage === 'smoke-media-rls-b') {
          insist(one(await read('profiles', 'id,role', p.actorId)).role === 'user', 'ROLE_PRECHECK');
          checks.ordinaryProfile = true;
          if (p.stage === 'smoke-media-rls-b') {
            await denied(() => client.from('posts').delete().eq('id', f.postA).eq('author_id', f.actorA).select('id'));
            insist(one(await read('posts', 'id,body', f.postA)).body === post.body, 'FOREIGN_POST_CHANGED');
            const media = one(await read('post_media', 'id,post_id,user_id,storage_path', f.videoMediaA));
            insist(media.post_id === f.postA && media.user_id === f.actorA && media.storage_path === f.videoPath, 'MEDIA_BINDING_MISMATCH');
            await denied(() => client.from('post_media').delete().eq('id', f.videoMediaA).eq('user_id', f.actorA).select('id'));
            const after = one(await read('post_media', 'id,post_id,user_id,storage_path', f.videoMediaA));
            insist(after.post_id === media.post_id && after.user_id === media.user_id && after.storage_path === media.storage_path, 'FOREIGN_MEDIA_CHANGED');
            checks.foreignPostDeleteDeniedUnchanged = checks.foreignMediaDeniedUnchanged = true;
          }
        } else {
        const media = one(await read('post_media', 'id,post_id,user_id,storage_path', f.imageMediaA));
        insist(media.user_id === f.actorA && typeof media.storage_path === 'string' && media.storage_path.includes(p.namespace), 'MEDIA_BINDING_MISMATCH');
        await denied(() => client.from('post_media').delete().eq('id', f.imageMediaA).eq('user_id', f.actorA).select('id'));
        const after = one(await read('post_media', 'id,post_id,user_id,storage_path', f.imageMediaA));
        insist(after.id === media.id && after.storage_path === media.storage_path && after.post_id === media.post_id && after.user_id === media.user_id, 'FOREIGN_MEDIA_CHANGED');
        insist(one(await read('profiles', 'id,role', p.actorId)).role === 'user', 'ROLE_PRECHECK');
        await denied(() => client.from('profiles').update({ role: 'admin' }).eq('id', p.actorId).select('id'));
        insist(one(await read('profiles', 'id,role', p.actorId)).role === 'user', 'ROLE_ESCALATION');
        checks.foreignPostDeniedUnchanged = checks.foreignMediaDeniedUnchanged = checks.roleEscalationDeniedUnchanged = true;
        }
      }
    }
    return { status: 'PASS', actor: p.actor, stage: p.stage, actorId: resolvedActorId, binding: p.binding,
      ...(providerCreatedAtUTC ? { providerCreatedAtUTC } : {}),
      utc: new Date().toISOString(), counts, checks, sensitiveValuesExported: false };
  } catch (e) {
    const reasons = new Set(['REQUEST_COMPLETION_UNKNOWN', 'SDK_ERROR', 'DEADLINE_EXPIRED', 'BATCH_BUDGET', 'SESSION_IDENTITY_MISMATCH', 'EMAIL_CONFIRMATION_UNKNOWN', 'ORDINARY_PROFILE_NOT_PROVEN', 'REFRESH_IDENTITY_MISMATCH', 'REFRESH_READBACK_MISMATCH', 'EXACT_ROW_NOT_VISIBLE', 'AUTH_FAILURE_NOT_RLS_PROOF', 'UNEXPECTED_WRITE_SUCCESS', 'DENIAL_UNCONFIRMED', 'POST_BINDING_MISMATCH', 'OWN_UPDATE_UNCONFIRMED', 'OWN_UPDATE_READBACK', 'COMMENT_BINDING_MISMATCH', 'FOREIGN_COMMENT_CHANGED', 'FOREIGN_POST_CHANGED', 'MEDIA_BINDING_MISMATCH', 'FOREIGN_MEDIA_CHANGED', 'ROLE_PRECHECK', 'ROLE_ESCALATION']);
    reasons.add('PROVIDER_CREATION_TIME_UNKNOWN');
    return { status: 'BLOCKED', actor: p.actor, stage: p.stage, binding: p.binding,
      utc: new Date().toISOString(), reason: reasons.has(e?.message) ? e.message : 'UNKNOWN',
      counts, checks, authError: failure, outstandingCompletion: 'UNCONFIRMED_IF_TIMEOUT', sensitiveValuesExported: false };
  }
}

export function buildOwnerSnippet(plan) {
  checkPlan(plan);
  const safePlan = Object.fromEntries(['binding', 'namespace', 'journalVerified', 'priorAliasAbsenceSha256', 'actorId', 'actor', 'stage', 'deadlineUTC', 'fixtures', 'expectedEmail'].filter(k => plan[k] !== undefined).map(k => [k, plan[k]]));
  // Uses the already deployed singleton in the same real user context; no token export.
  return `(async()=>{const p=${JSON.stringify(safePlan)};if(location.origin!==${JSON.stringify(origin)})throw Error('ORIGIN');const checkPlan=${checkPlan.toString()};const uuid=${uuid};checkPlan(p);const key='ogh-once:'+p.binding+':'+p.actor+':'+p.stage;if(sessionStorage.getItem(key))throw Error('CONSUMED');sessionStorage.setItem(key,'started');const authEvidence=${authEvidence.toString()};const CODES=new Set(${JSON.stringify(['email_not_confirmed','invalid_credentials','captcha_failed','user_banned','request_timeout','session_not_found','unexpected_failure'])});const UUID=${uuid};const m=await import(${JSON.stringify(asset)});const r=await (${runSessionChecks.toString()})(m.n(),p);const blob=new Blob([JSON.stringify(r)],{type:'application/json'});const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download='ogh-core-'+p.actor+'-'+p.stage+'-'+p.binding.slice(0,16)+'.safe.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return {status:r.status,stage:p.stage};})()`;
}

// Assertions only. The caller must independently approve/bind the source, client,
// fixture and single use. Both callbacks use the same ordinary session. Counts
// cover operator calls only; this function cannot authorize or cancel server work.
export async function runFreshOneActorForeignIsolation(client, plan, readOrdinaryWorker) {
  return runBoundForeignIsolation(client, plan, readOrdinaryWorker, null, false);
}

// Both sessions must come from separately approved normal signups. Receipt pins,
// ordinary credentials, client/Worker context provenance and single use require
// external verification; these assertions cannot establish transport provenance.
export async function runTwoFreshOrdinaryForeignIsolation(ownerClient, client, plan, readOrdinaryWorker) {
  return runBoundForeignIsolation(client, plan, readOrdinaryWorker, ownerClient, true);
}

async function runBoundForeignIsolation(client, plan, readOrdinaryWorker, ownerClient, twoFresh) {
  const counts = { auth: 0, rest: 0, worker: 0 };
  const caps = { auth: twoFresh ? 6 : 3, rest: twoFresh ? 12 : 9, worker: 2 };
  const checks = {};
  const reasons = new Set(['PLAN_INVALID', 'SOURCE_BINDING_INVALID', 'JOURNAL_BINDING_INVALID',
    'FIXTURE_BINDING_INVALID', 'CLIENT_PROJECT_MISMATCH', 'DEADLINE_EXPIRED', 'BATCH_BUDGET',
    'SDK_ERROR', 'SESSION_IDENTITY_MISMATCH', 'EMAIL_CONFIRMATION_UNKNOWN', 'ORDINARY_PROFILE_NOT_PROVEN',
    'EXACT_ROW_NOT_VISIBLE', 'PUBLIC_FIXTURE_NOT_VISIBLE', 'AUTH_FAILURE_NOT_RLS_PROOF',
    'UNEXPECTED_WRITE_SUCCESS', 'DENIAL_UNCONFIRMED', 'FOREIGN_POST_CHANGED', 'FOREIGN_MEDIA_CHANGED',
    'ADMIN_ACCESS_NOT_DENIED', 'REQUEST_COMPLETION_UNKNOWN', 'SESSION_BINDING_INVALID']);
  let completionUnknown = false;
  const insist = (ok, reason) => { if (!ok) throw new Error(reason); };
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const id = value => typeof value === 'string' && uuid.test(value);
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  try {
    const p = structuredClone(plan);
    const project = 'xcbnxzjlsvtgzixurcof';
    const expected = p?.expected;
    const source = p?.source;
    const journal = p?.journal;
    const absence = p?.absence;
    const f = p?.foreignFixture;
    insist(p?.project === project && p.origin === origin && hash(p.binding)
      && expected?.project === project && expected.binding === p.binding && id(expected.id)
      && typeof expected.email === 'string' && expected.email.length <= 254
      && /^ogh-core-ordinary-[a-z0-9-]{20,100}$/.test(expected.namespace ?? '')
      && date(expected.createdAt) && date(p.deadlineUTC) && typeof readOrdinaryWorker === 'function', 'PLAN_INVALID');
    insist(source?.verified === true && source.binding === p.binding && source.project === project && source.origin === origin
      && /^[a-f0-9]{40}$/.test(source.commit ?? '') && hash(source.sha256), 'SOURCE_BINDING_INVALID');
    const banned = p.excludedBannedIds;
    insist(banned && Object.keys(banned).length === 3 && ['A3', 'B3', 'B4'].every(key => id(banned[key]))
      && new Set(Object.values(banned)).size === 3
      && !Object.values(banned).includes(expected.id), 'JOURNAL_BINDING_INVALID');
    function boundSignup(e, j, a) {
      insist(j?.verified === true && hash(j.sha256) && j.binding === p.binding
        && j.project === project && j.namespace === e.namespace && j.email === e.email
        && j.actorId === e.id && j.createdAt === e.createdAt && j.submitCount === 1
        && j.method === 'NORMAL_OWNER_WEBSITE_SIGNUP'
        && a?.verified === true && hash(a.sha256) && a.binding === p.binding
        && a.project === project && a.email === e.email && a.matches === 0, 'JOURNAL_BINDING_INVALID');
    }
    boundSignup(expected, journal, absence);
    const owner = p.owner;
    if (twoFresh) {
      const e = owner?.expected;
      insist(e?.project === project && e.binding === p.binding && id(e.id) && e.id !== expected.id
        && !Object.values(banned).includes(e.id) && typeof e.email === 'string' && e.email.length <= 254
        && e.email.toLowerCase() !== expected.email.toLowerCase()
        && /^ogh-core-ordinary-[a-z0-9-]{20,100}$/.test(e.namespace ?? '') && date(e.createdAt), 'JOURNAL_BINDING_INVALID');
      boundSignup(e, owner.journal, owner.absence);
      function boundSession(receipt, actor, j) {
        insist(receipt?.verified === true && hash(receipt.sha256) && receipt.binding === p.binding
          && receipt.project === project && receipt.origin === origin && receipt.sourceSha256 === source.sha256
          && receipt.authRole === 'authenticated' && receipt.provenance === 'NORMAL_WEBSITE_SESSION'
          && receipt.actorId === actor.id && receipt.journalSha256 === j.sha256 && hash(receipt.sessionContextSha256)
          && date(receipt.observedAtUTC) && Date.parse(receipt.observedAtUTC) >= Date.parse(actor.createdAt)
          && Date.parse(receipt.observedAtUTC) < Date.parse(p.deadlineUTC), 'SESSION_BINDING_INVALID');
      }
      boundSession(p.sessionReceipt, expected, journal);
      boundSession(owner.sessionReceipt, e, owner.journal);
      insist(owner.sessionReceipt.sessionContextSha256 !== p.sessionReceipt.sessionContextSha256, 'SESSION_BINDING_INVALID');
    }
    insist(f?.verified === true && hash(f.sha256) && f.binding === p.binding && f.sourceSha256 === source.sha256
      && ['authorId', 'postId', 'mediaId', 'circleId'].every(key => id(f[key]))
      && (twoFresh ? f.authorId === owner.expected.id && f.creatorJournalSha256 === owner.journal.sha256
        && f.namespace === owner.expected.namespace : f.authorId === banned.A3)
      && f.authorId !== expected.id
      && /^ogh-core-ordinary-[a-z0-9-]{20,100}$/.test(f.namespace ?? '')
      && typeof f.storagePath === 'string'
      && [ `${f.authorId}/${f.postId}/`, `tmp/${f.authorId}/${f.postId}/` ].some(prefix =>
        f.storagePath.startsWith(prefix) && /^[a-z0-9_-][a-z0-9._-]{0,239}$/i.test(f.storagePath.slice(prefix.length))),
    'FIXTURE_BINDING_INVALID');
    insist(client?.supabaseUrl === `https://${project}.supabase.co`, 'CLIENT_PROJECT_MISMATCH');
    if (twoFresh) insist(ownerClient && ownerClient !== client
      && ownerClient.supabaseUrl === `https://${project}.supabase.co`, 'CLIENT_PROJECT_MISMATCH');
    const deadline = Date.parse(p.deadlineUTC);
    async function call(type, operation) {
      insist(Date.now() < deadline, 'DEADLINE_EXPIRED');
      insist(counts[type] < caps[type], 'BATCH_BUDGET');
      counts[type]++;
      let timer;
      try {
        const result = await Promise.race([
          Promise.resolve().then(operation),
          new Promise((_, reject) => { timer = setTimeout(() => {
            completionUnknown = true;
            reject(new Error('REQUEST_COMPLETION_UNKNOWN'));
          }, Math.min(8000, Math.max(1, deadline - Date.now()))); }),
        ]);
        if (Date.now() >= deadline) {
          completionUnknown = true;
          throw new Error('DEADLINE_EXPIRED');
        }
        return result;
      } finally { clearTimeout(timer); }
    }
    function data(response) {
      insist(response && !response.error, 'SDK_ERROR');
      return response.data;
    }
    function identity(response, actor = expected, j = journal, a = absence) {
      const user = data(response)?.user;
      if (twoFresh) insist(user?.role === 'authenticated' && user.is_anonymous !== true, 'SESSION_IDENTITY_MISMATCH');
      insist(ordinarySignupIdentityEvidence({ user, expected: actor, journal: j, absence: a,
        sourceProject: source.project, excludedIds: Object.values(banned) }).identityVerified, 'SESSION_IDENTITY_MISMATCH');
      insist(date(user.email_confirmed_at), 'EMAIL_CONFIRMATION_UNKNOWN');
    }
    async function read(table, columns, rowId, actorClient = client) {
      const rows = data(await call('rest', () => actorClient.from(table).select(columns).eq('id', rowId).limit(2)));
      insist(Array.isArray(rows) && rows.length === 1, 'EXACT_ROW_NOT_VISIBLE');
      return structuredClone(rows[0]);
    }
    async function denied(operation) {
      const r = await call('rest', operation);
      insist(r?.status !== 401 && r?.error?.status !== 401, 'AUTH_FAILURE_NOT_RLS_PROOF');
      insist(!(Array.isArray(r?.data) && r.data.length), 'UNEXPECTED_WRITE_SUCCESS');
      insist(r?.status === 403 || r?.error?.code === '42501'
        || (!r?.error && [200, 204].includes(r?.status) && Array.isArray(r.data) && r.data.length === 0), 'DENIAL_UNCONFIRMED');
    }
    if (twoFresh) {
      const e = owner.expected;
      const ownerIdentity = response => identity(response, e, owner.journal, owner.absence);
      ownerIdentity(await call('auth', () => ownerClient.auth.getUser()));
      const profile = await read('profiles', 'id,role', e.id, ownerClient);
      insist(profile.id === e.id && profile.role === 'user', 'ORDINARY_PROFILE_NOT_PROVEN');
      ownerIdentity(await call('auth', () => ownerClient.auth.refreshSession()));
      ownerIdentity(await call('auth', () => ownerClient.auth.getUser()));
    }
    identity(await call('auth', () => client.auth.getUser()));
    const profile = await read('profiles', 'id,role', expected.id);
    insist(profile.id === expected.id && profile.role === 'user', 'ORDINARY_PROFILE_NOT_PROVEN');
    identity(await call('auth', () => client.auth.refreshSession()));
    identity(await call('auth', () => client.auth.getUser()));
    checks.ordinaryStableIdentity = true;
    if (twoFresh) checks.twoFreshOrdinaryIdentities = true;

    const postColumns = 'id,author_id,body,circle_id,status,moderation_status,circles:circle_id(id,slug,name,status)';
    const mediaColumns = 'id,post_id,user_id,kind,storage_path';
    function publicPost(post) {
      const circle = Array.isArray(post.circles) ? (post.circles.length === 1 ? post.circles[0] : null) : post.circles;
      insist(post.id === f.postId && post.author_id === f.authorId && post.circle_id === f.circleId
        && typeof post.body === 'string' && post.body.includes(f.namespace)
        && post.status === 'published' && post.moderation_status === 'published'
        && circle?.id === f.circleId && circle.status === 'active'
        && typeof circle.slug === 'string' && typeof circle.name === 'string'
        && !['rls-test-circle', 'rls-test', 'test-circle'].includes(circle.slug.toLowerCase())
        && !circle.name.toLowerCase().includes('rls test'), 'PUBLIC_FIXTURE_NOT_VISIBLE');
    }
    function publicMedia(media) {
      insist(media.id === f.mediaId && media.post_id === f.postId && media.user_id === f.authorId
        && media.kind === 'video' && media.storage_path === f.storagePath, 'PUBLIC_FIXTURE_NOT_VISIBLE');
    }
    let ownerPost, ownerMedia;
    if (twoFresh) {
      ownerPost = await read('posts', postColumns, f.postId, ownerClient);
      publicPost(ownerPost);
      ownerMedia = await read('post_media', mediaColumns, f.mediaId, ownerClient);
      publicMedia(ownerMedia);
      checks.ownerFixtureReadback = true;
    }
    const post = await read('posts', postColumns, f.postId);
    publicPost(post);
    const media = await read('post_media', mediaColumns, f.mediaId);
    publicMedia(media);
    if (twoFresh) insist(['id', 'author_id', 'body', 'circle_id', 'status', 'moderation_status'].every(key => ownerPost[key] === post[key])
      && ['id', 'post_id', 'user_id', 'kind', 'storage_path'].every(key => ownerMedia[key] === media[key]), 'FIXTURE_BINDING_INVALID');
    checks.publicForeignFixtureVisible = true;
    async function unchangedPost() {
      const after = await read('posts', postColumns, f.postId);
      insist(['id', 'author_id', 'body', 'circle_id', 'status', 'moderation_status'].every(key => after[key] === post[key]), 'FOREIGN_POST_CHANGED');
    }
    await denied(() => client.from('posts').update({ body: `${expected.namespace} forbidden` })
      .eq('id', f.postId).eq('author_id', f.authorId).select('id'));
    await unchangedPost();
    checks.foreignPostUpdateDeniedUnchanged = true;
    await denied(() => client.from('posts').delete().eq('id', f.postId).eq('author_id', f.authorId).select('id'));
    await unchangedPost();
    checks.foreignPostDeleteDeniedUnchanged = true;
    await denied(() => client.from('post_media').delete().eq('id', f.mediaId).eq('user_id', f.authorId).select('id'));
    const after = await read('post_media', mediaColumns, f.mediaId);
    insist(['id', 'post_id', 'user_id', 'kind', 'storage_path'].every(key => after[key] === media[key]), 'FOREIGN_MEDIA_CHANGED');
    checks.foreignMediaDeleteDeniedUnchanged = true;
    for (const path of ['/api/admin/forum/me', '/api/admin/devices']) {
      const response = await call('worker', () => readOrdinaryWorker(`${origin}${path}`, { method: 'GET' }));
      insist(response?.status !== 401, 'AUTH_FAILURE_NOT_RLS_PROOF');
      insist(response?.status === 403, 'ADMIN_ACCESS_NOT_DENIED');
    }
    checks.ordinaryStaffAndAdminDenied = true;
    return { status: 'PASS', counts, checks, productionAuthority: false, sensitiveValuesExported: false };
  } catch (error) {
    const reason = reasons.has(error?.message) ? error.message : 'UNKNOWN';
    return { status: completionUnknown || reason === 'UNKNOWN' ? 'UNKNOWN' : 'BLOCKED', reason,
      counts, checks, outstandingCompletion: completionUnknown || reason === 'UNKNOWN' ? 'UNKNOWN' : 'NONE',
      productionAuthority: false, sensitiveValuesExported: false };
  }
}
