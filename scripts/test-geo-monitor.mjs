import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseObservations } from './geo-monitor.mjs';
const header = 'date,platform,report,metric,value,url,query,test_result,evidence,notes\n';
test('missing measurements remain absent and zero is preserved as observed zero', () => {
  const rows = parseObservations(header + '2026-11-02,google_search_console,web,organic_impressions,,https://example.invalid/,,,,\n2026-11-02,google_search_console,generative_search,ai_search_impressions,0,https://example.invalid/,,,,\n');
  assert.equal(rows[0].value, null);
  assert.equal(rows[1].value, 0);
  assert.equal(rows[0].metric, 'organic_impressions');
  assert.equal(rows[1].metric, 'ai_search_impressions');
});
test('manual citation outcomes are distinct from machine citation counts, with quoted CSV support', () => {
  const rows = parseObservations('\ufeff' + header + '2026-11-02,manual_ai_search,manual,manual_citation_test,,https://example.invalid/,"AR, AI?",inconclusive,"local evidence","multi\nline"\n');
  assert.equal(rows[0].query, 'AR, AI?');
  assert.equal(rows[0].test_result, 'inconclusive');
  assert.equal(rows[0].value, null);
  assert.throws(() => parseObservations(header + '2026-11-02,manual_ai_search,manual,manual_citation_test,1,,,cited,,\n'));
});
test('rejects malformed dates, metrics, negative values, invalid citation outcomes and broken CSV', () => {
  for (const row of [
    '2026-02-30,analytics,referral,ai_referral_visits,2,,,,,',
    '2026-11-02,analytics,referral,unknown,2,,,,,',
    '2026-11-02,analytics,referral,ai_referral_visits,-1,,,,,',
    '2026-11-02,manual_ai_search,manual,manual_citation_test,,,,yes,,',
    '2026-11-02,google_search_console,generative_search,ai_citations,2,,,,,',
    '"unclosed',
  ]) assert.throws(() => parseObservations(header + row));
  assert.deepEqual(parseObservations(header), []);
});
