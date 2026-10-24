// Post-login owner-operated checks only. This module cannot log in or grant consent.
import { authEvidence } from './core-auth-admission-v2.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const origin = 'https://openglasshub.ogh.workers.dev';
const asset = '/_astro/supabase-browser.CbJzQpCJ.js';

export function checkPlan(p, now = Date.now()) {
  const require = (ok, reason) => { if (!ok) throw new Error(reason); };
  require(p && /^[a-f0-9]{64}$/.test(p.binding), 'BINDING_INVALID');
  require(/^ogh-core-ordinary-[a-z0-9-]{20,100}$/.test(p.namespace), 'NAMESPACE_INVALID');
  require(p.journalVerified === true && uuid.test(p.actorId), 'CREATE_JOURNAL_REQUIRED');
  if (p.expectedEmail !== undefined) require(typeof p.expectedEmail === 'string'
    && /^[^\s@]+\+ogh-(a3|b3)-[a-f0-9]{16}@gmail\.com$/.test(p.expectedEmail), 'PRIVATE_EMAIL_BINDING_INVALID');
  require(['A3', 'B3'].includes(p.actor), 'ACTOR_INVALID');
  require(['auth', 'rls-a', 'rls-b', 'smoke-rls-b', 'logout'].includes(p.stage), 'STAGE_INVALID');
  require(typeof p.deadlineUTC === 'string' && Number.isFinite(Date.parse(p.deadlineUTC))
    && now < Date.parse(p.deadlineUTC), 'DEADLINE_INVALID');
  if (p.stage.includes('rls')) {
    const f = p.fixtures;
    const keys = p.stage === 'smoke-rls-b' ? ['actorA', 'actorB', 'postA'] : ['actorA', 'actorB', 'postA', 'commentB', 'imageMediaA'];
    require(f && keys.every(k => uuid.test(f[k])), 'FIXTURE_INVALID');
    require(f.actorA !== f.actorB && p.actorId === (p.stage === 'rls-a' ? f.actorA : f.actorB)
      && p.actor === (p.stage === 'rls-a' ? 'A3' : 'B3'), 'FIXTURE_ACTOR_MISMATCH');
  }
  return p;
}

export async function runSessionChecks(client, p) {
  checkPlan(p);
  const counts = { auth: 0, rest: 0 };
  const checks = {};
  let failure = null;
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
    insist(user?.id === p.actorId, 'SESSION_IDENTITY_MISMATCH');
    insist(p.expectedEmail === undefined || user?.email === p.expectedEmail, 'SESSION_IDENTITY_MISMATCH');
    checks.exactAuthenticatedUser = true;
    if (p.stage === 'auth') {
      insist(Number.isFinite(Date.parse(user.email_confirmed_at)), 'EMAIL_CONFIRMATION_UNKNOWN');
      const row = one(await read('profiles', 'id,role', p.actorId));
      insist(row.id === p.actorId && row.role === 'user', 'ORDINARY_PROFILE_NOT_PROVEN');
      const refreshed = success(await call('auth', () => client.auth.refreshSession()));
      insist(refreshed?.user?.id === p.actorId, 'REFRESH_IDENTITY_MISMATCH');
      const again = success(await call('auth', () => client.auth.getUser()));
      insist(again?.user?.id === p.actorId, 'REFRESH_READBACK_MISMATCH');
      checks.ordinaryProfile = checks.confirmedEmail = checks.refreshedIdentity = true;
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
        if (p.stage === 'smoke-rls-b') {
          insist(one(await read('profiles', 'id,role', p.actorId)).role === 'user', 'ROLE_PRECHECK');
          checks.ordinaryProfile = true;
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
    return { status: 'PASS', actor: p.actor, stage: p.stage, actorId: p.actorId, binding: p.binding,
      utc: new Date().toISOString(), counts, checks, sensitiveValuesExported: false };
  } catch (e) {
    const reasons = new Set(['REQUEST_COMPLETION_UNKNOWN', 'SDK_ERROR', 'DEADLINE_EXPIRED', 'BATCH_BUDGET', 'SESSION_IDENTITY_MISMATCH', 'EMAIL_CONFIRMATION_UNKNOWN', 'ORDINARY_PROFILE_NOT_PROVEN', 'REFRESH_IDENTITY_MISMATCH', 'REFRESH_READBACK_MISMATCH', 'EXACT_ROW_NOT_VISIBLE', 'AUTH_FAILURE_NOT_RLS_PROOF', 'UNEXPECTED_WRITE_SUCCESS', 'DENIAL_UNCONFIRMED', 'POST_BINDING_MISMATCH', 'OWN_UPDATE_UNCONFIRMED', 'OWN_UPDATE_READBACK', 'COMMENT_BINDING_MISMATCH', 'FOREIGN_COMMENT_CHANGED', 'FOREIGN_POST_CHANGED', 'MEDIA_BINDING_MISMATCH', 'FOREIGN_MEDIA_CHANGED', 'ROLE_PRECHECK', 'ROLE_ESCALATION']);
    return { status: 'BLOCKED', actor: p.actor, stage: p.stage, binding: p.binding,
      utc: new Date().toISOString(), reason: reasons.has(e?.message) ? e.message : 'UNKNOWN',
      counts, checks, authError: failure, outstandingCompletion: 'UNCONFIRMED_IF_TIMEOUT', sensitiveValuesExported: false };
  }
}

export function buildOwnerSnippet(plan) {
  checkPlan(plan);
  const safePlan = Object.fromEntries(['binding', 'namespace', 'journalVerified', 'actorId', 'actor', 'stage', 'deadlineUTC', 'fixtures', 'expectedEmail'].filter(k => plan[k] !== undefined).map(k => [k, plan[k]]));
  // Uses the already deployed singleton in the same real user context; no token export.
  return `(async()=>{const p=${JSON.stringify(safePlan)};if(location.origin!==${JSON.stringify(origin)})throw Error('ORIGIN');const checkPlan=${checkPlan.toString()};const uuid=${uuid};checkPlan(p);const key='ogh-once:'+p.binding+':'+p.actor+':'+p.stage;if(sessionStorage.getItem(key))throw Error('CONSUMED');sessionStorage.setItem(key,'started');const authEvidence=${authEvidence.toString()};const CODES=new Set(${JSON.stringify(['email_not_confirmed','invalid_credentials','captcha_failed','user_banned','request_timeout','session_not_found','unexpected_failure'])});const UUID=${uuid};const m=await import(${JSON.stringify(asset)});const r=await (${runSessionChecks.toString()})(m.n(),p);const blob=new Blob([JSON.stringify(r)],{type:'application/json'});const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download='ogh-core-'+p.actor+'-'+p.stage+'-'+p.binding.slice(0,16)+'.safe.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return {status:r.status,stage:p.stage};})()`;
}
