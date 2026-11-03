import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

test('formal migration owns the unchanged rate-limit implementation without replacement', () => {
  const files = fs.readdirSync(new URL('supabase/migrations/', root));
  const matches = files.filter(name => name.endsWith('_adopt_existing_forum_rate_limit_baseline.sql'));
  assert.equal(matches.length, 1, 'FORMAL_RATE_LIMIT_MIGRATION_REQUIRED');
  const sql = read('supabase/migrations/' + matches[0]);
  const proposal = read('docs/ops/reconciliation/operational-guardrails-rate-limit-r2-unexecuted-proposal.sql');
  const body = proposal.split('$function$')[1].replace(/\s+/g, ' ').trim();
  assert.equal(sql.split('$baseline_body$')[1].replace(/\s+/g, ' ').trim(), body);
  assert.doesNotMatch(sql, /CREATE\s+OR\s+REPLACE/i);
  assert.doesNotMatch(sql, /regexp_replace\(target\.prosrc/);
  assert.ok(sql.includes('replace(target.prosrc,chr(13)||chr(10),chr(10))'));
  for (const token of ['RATE_LIMIT_BASELINE_DRIFT', 'prosecdef', 'proleakproof', 'proparallel', 'aclexplode', 'proconfig']) {
    assert.ok(sql.includes(token), 'MISSING_DRIFT_CHECK:' + token);
  }
});

test('local rebuild must not install the unexecuted proposal after migration replay', () => {
  const source = read('scripts/qa/run-local-user-e2e.mjs');
  assert.doesNotMatch(source, /operational-guardrails-rate-limit-r2-unexecuted-proposal\.sql/);
  assert.doesNotMatch(source, /await sql\(s,proposal/);
  assert.ok(source.includes('LOCAL_FORMAL_RATE_LIMIT_BASELINE_MISSING'));
  assert.ok(source.includes("s.catalogFixtureApplied=process.env.OGH_E2E_MIGRATION_RECONCILIATION!=='1'"));
  assert.ok(source.includes('if(s.catalogFixtureApplied)'));
});

test('comment regression cannot silently install a missing placeholder migration', () => {
  const source = read('scripts/qa/local-comment-delete-regression.mjs');
  assert.doesNotMatch(source, /installed==='0'.*await sql/);
  assert.ok(source.includes('FORMAL_COMMENT_PLACEHOLDER_MIGRATION_REQUIRED'));
});
