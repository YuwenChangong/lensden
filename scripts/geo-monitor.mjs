import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const columns = 'date,platform,report,metric,value,url,query,test_result,evidence,notes'.split(',');
const allowed = {
  google_search_console: ['indexed_pages', 'organic_impressions', 'ai_search_impressions'],
  bing_webmaster_tools: ['indexed_pages', 'organic_impressions', 'ai_citations'],
  analytics: ['ai_referral_visits'],
  manual_ai_search: ['manual_citation_test'],
};
// Local normalized CSV only. No credentials, telemetry, SDK, requests or writes.
export function parseObservations(csv) {
  if (Buffer.byteLength(csv) > 2_000_000) throw new Error('CSV exceeds 2 MB.');
  const records = [], fields = [];
  let field = '', quoted = false, closed = false;
  const pushField = () => { fields.push(field); field = ''; closed = false; };
  const pushRecord = () => { pushField(); if (fields.some(Boolean)) records.push([...fields]); fields.length = 0; };
  csv = csv.replace(/^\ufeff/, '');
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',') pushField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && csv[i + 1] === '\n') i++; pushRecord(); }
    else if (c === '"' && !field && !closed) quoted = true;
    else if (closed || c === '"') throw new Error('Malformed CSV quoting.');
    else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || fields.length) pushRecord();
  if (JSON.stringify(records.shift()) !== JSON.stringify(columns)) throw new Error('Use the normalized monitoring CSV header.');
  return records.map((fields, index) => {
    const invalid = () => { throw new Error(`Invalid observation at data row ${index + 1}.`); };
    if (fields.length !== columns.length) invalid();
    const row = Object.fromEntries(columns.map((key, i) => [key, fields[i]]));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? new Date(row.date) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date || !row.report
      || !allowed[row.platform]?.includes(row.metric)) invalid();
    if (row.url) { try { const url = new URL(row.url); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) invalid(); } catch { invalid(); } }
    if (row.metric === 'manual_citation_test') {
      if (row.value !== '' || !row.query || !['cited', 'not_cited', 'inconclusive'].includes(row.test_result)) invalid();
    } else if (row.test_result || (row.value !== '' && (!/^\d+$/.test(row.value) || !Number.isSafeInteger(Number(row.value))))) invalid();
    return { ...row, value: row.value === '' ? null : Number(row.value) };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--input' || /^https?:/i.test(process.argv[3])) throw new Error('Usage: node scripts/geo-monitor.mjs --input <local-normalized.csv>');
  const path = resolve(process.argv[3]);
  if ((await stat(path)).size > 2_000_000) throw new Error('CSV exceeds 2 MB.');
  const observations = parseObservations(await readFile(path, 'utf8'));
  console.log(JSON.stringify({ observations, externalRequests: 0, writes: 0 }, null, 2));
}
