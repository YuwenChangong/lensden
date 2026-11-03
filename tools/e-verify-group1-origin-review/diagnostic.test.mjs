import test from 'node:test';
import assert from 'node:assert/strict';
import { OriginDiagnostic } from './diagnostic.mjs';
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://db.example.invalid';
const main = { url: () => appOrigin + '/login/' }, vendor = { url: () => 'https://challenges.cloudflare.com/private-frame?secret=DO_NOT_LOG' };
const page = { mainFrame: () => main };
const request = (url, { frame = main, parent = null, method = 'GET', type = 'fetch' } = {}) => ({ url: () => url,
  method: () => method, resourceType: () => type, frame: () => { if (!frame) throw Error('FRAME_UNAVAILABLE'); return frame; },
  redirectedFrom: () => parent, allHeaders: () => { throw Error('HEADERS_MUST_NOT_BE_READ'); }, postData: () => { throw Error('BODY_MUST_NOT_BE_READ'); } });
const create = options => new OriginDiagnostic({ appOrigin, supabaseOrigin, staticPaths: ['/_astro/public.verified.js'], ...options });
const meta = { page, actor: 'A', stage: 'LOGIN_A' };

test('unknown origin becomes actionable private components, never a URL/query/body in shared evidence', async () => {
  const captured = [], d = create({ captureOrigin: value => { captured.push(value); return 'origin-' + 'a'.repeat(32); } });
  const row = await d.observe(request('https://unknown.example.invalid/PRIVATE_PATH?token=PRIVATE_QUERY#PRIVATE_FRAGMENT'), meta);
  assert.deepEqual(captured, [{ scheme: 'https:', host: 'unknown.example.invalid', port: '443' }]);
  assert.equal(row.ruleMatched, false); assert.equal(row.originClass, 'OTHER_ORIGIN');
  assert.equal(row.originEvidence.status, 'PRIVATE_ORIGIN_CAPTURE_ACKNOWLEDGED');
  assert.equal(row.frameClass, 'APPLICATION_MAIN_FRAME'); assert.equal(row.dispatchStatus, 'UNKNOWN_OR_ALREADY_SENT');
  for (const secret of ['PRIVATE_PATH', 'PRIVATE_QUERY', 'PRIVATE_FRAGMENT', 'unknown.example.invalid']) assert.ok(!JSON.stringify(row).includes(secret));
  d.dispose();
});
test('source-known vendor/R2 identifiers never authorize an unapproved origin', async () => {
  const d = create({ sourceOrigins: { 'https://media.example.invalid': 'SOURCE_ONLY_MEDIA' } });
  const row = await d.observe(request('https://media.example.invalid/image.png', { frame: vendor }), meta);
  assert.equal(row.sourceHostId, 'SOURCE_ONLY_MEDIA'); assert.equal(row.ruleMatched, false);
  assert.equal(row.frameClass, 'TURNSTILE_FRAME'); assert.equal(row.originEvidence.status, 'PROTECTED_CAPTURE_UNAVAILABLE'); d.dispose();
});
test('CDP keeps only bounded metadata and labels correlation as candidate, not a proven Request link', async () => {
  const d = create(), url = appOrigin + '/_astro/public.verified.js?token=DO_NOT_LOG';
  const event = { requestId: 'fixture-request-1', request: { url, method: 'GET', headers: { authorization: 'SECRET_HEADER' } },
    initiator: { type: 'script', stack: { callFrames: [{ url: appOrigin + '/_astro/public.verified.js?session=SECRET_STACK' }] } } };
  d.observeCdp(event); const one = await d.observe(request(url), meta);
  assert.equal(one.cdpCorrelation, 'SINGLE_CANDIDATE_NOT_PROVEN'); assert.equal(one.cdpCandidates[0].initiatorType, 'script');
  assert.ok(one.cdpCandidates[0].publicInitiatorId.startsWith('VERIFIED_ASSET_'));
  d.observeCdp({ ...event, requestId: 'fixture-request-2' }); const two = await d.observe(request(url), meta);
  assert.equal(two.cdpCorrelation, 'AMBIGUOUS_CANDIDATES');
  for (const value of ['SECRET_HEADER', 'SECRET_STACK', 'DO_NOT_LOG', 'fixture-request-1']) assert.ok(!JSON.stringify(two).includes(value)); d.dispose();
});
test('real Frame and redirect observations replace hardcoded unavailable/none labels', async () => {
  const d = create(), parent = request(appOrigin + '/login/'); const a = await d.observe(parent, meta);
  const child = await d.observe(request('https://unknown.example.invalid/redirected', { parent, frame: vendor }), meta);
  assert.equal(child.redirectRelation, 'REDIRECT_CHAIN'); assert.equal(child.redirectParentEventId, a.eventId);
  assert.equal(child.frameClass, 'TURNSTILE_FRAME');
  const unavailable = await d.observe(request(appOrigin + '/login/', { frame: null }), meta);
  assert.equal(unavailable.frameClass, 'FRAME_UNAVAILABLE'); d.dispose();
});
test('same run links repeat URLs; different origins and separate runs cannot collapse to the old pathname-only id', async () => {
  const d = create(), q = request('https://one.example.invalid/path');
  const a = await d.observe(q, meta), b = await d.observe(q, meta), c = await d.observe(request('https://two.example.invalid/path'), meta);
  assert.equal(a.requestMatchId, b.requestMatchId); assert.notEqual(a.eventId, b.eventId); assert.notEqual(a.requestMatchId, c.requestMatchId);
  const other = create(); assert.notEqual(a.requestMatchId, (await other.observe(q, meta)).requestMatchId); other.dispose(); d.dispose();
});
test('sensitive origin envelopes, IPs, long opaque labels and malformed requests fail privacy-safe', async () => {
  let captures = 0; const d = create({ captureOrigin: () => { captures++; return 'origin-' + 'a'.repeat(32); } });
  for (const url of ['https://PRIVATE_USER:PRIVATE_PASSWORD@unknown.example.invalid/path', 'https://127.0.0.1/path',
    'https://' + 'a'.repeat(64) + '.example.invalid/path']) {
    const row = await d.observe(request(url), meta); assert.equal(row.originEvidence.status, 'PRIVACY_BLOCKED');
    assert.ok(!JSON.stringify(row).includes('PRIVATE_PASSWORD'));
  }
  await assert.rejects(() => d.observe(request('SECRET_MALFORMED_URL'), meta), /^Error: DIAGNOSTIC_REQUEST_ENVELOPE_INVALID$/);
  assert.equal(captures, 0); d.dispose();
});
test('capture failure cannot leak thrown input or falsely claim private evidence exists', async () => {
  const d = create({ captureOrigin: () => { throw Error('SECRET_EXCEPTION'); } });
  const row = await d.observe(request('https://unknown.example.invalid/path'), meta);
  assert.equal(row.originEvidence.status, 'PROTECTED_CAPTURE_FAILED'); assert.equal(row.originEvidence.evidenceRef, null);
  assert.ok(!JSON.stringify(row).includes('SECRET_EXCEPTION')); d.dispose();
});
test('diagnostic metadata itself is bounded and cannot silently expand the request scope', async () => {
  const d = create(); await assert.rejects(() => d.observe(request(appOrigin + '/login/'), { ...meta, actor: 'B' }), /DIAGNOSTIC_ACTOR_STAGE/);
  for (let i = 0; i < 64; i++) await d.observe(request(appOrigin + '/login/'), meta);
  await assert.rejects(() => d.observe(request(appOrigin + '/login/'), meta), /DIAGNOSTIC_EVIDENCE_LIMIT/);
  d.dispose(); await assert.rejects(() => d.observe(request(appOrigin + '/login/'), meta), /DIAGNOSTIC_EVIDENCE_LIMIT/);
});
