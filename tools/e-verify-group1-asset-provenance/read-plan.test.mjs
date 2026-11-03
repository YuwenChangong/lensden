import test from 'node:test';
import assert from 'node:assert/strict';
let implementation;try{implementation=await import('./read-plan-policy.mjs')}catch{}
const origin='https://app.example.invalid';
const manifest=[{path:'/_astro/SiteHeader.astro_astro_type_script_index_0_lang.DaQNT1ww.js',bytes:1,sha256:'1'.repeat(64)},
  {path:'/_astro/SettingsPage.DImHgz8J.js',bytes:1,sha256:'2'.repeat(64)},
  {path:'/_astro/AuthPanel.EZiCXg-9.js',bytes:1,sha256:'3'.repeat(64)},
  {path:'/_astro/CommunityLayout.jf1vXvaF.css',bytes:1,sha256:'4'.repeat(64)}];
const target='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js';
const options={origin,manifest,requiredTarget:target};
const html=()=>Buffer.from(`<script type="module" src="${target}"></script><astro-island component-url="/_astro/AuthPanel.EZiCXg-9.js"></astro-island><link rel="stylesheet" href="/_astro/CommunityLayout.jf1vXvaF.css">`);
test('bounded dependency read policy is implemented',()=>assert.equal(typeof implementation?.AssetReadPlan,'function'));
test('only exact newly observed paths enter the finite read plan, not the old alternate filename',()=>{
  assert.ok(implementation);const p=new implementation.AssetReadPlan(options);p.observeHtml(html());
  assert.deepEqual(p.pending().sort(),[target,'/_astro/AuthPanel.EZiCXg-9.js','/_astro/CommunityLayout.jf1vXvaF.css'].sort());
  assert.equal(p.pending().includes(manifest[0].path),false);
  assert.throws(()=>p.reserve(origin+manifest[0].path,'GET'),/UNREFERENCED_ASSET/);
});
test('a literal import adds one exact same-origin reviewed-stem dependency without an _astro wildcard',async()=>{
  assert.ok(implementation);const p=new implementation.AssetReadPlan(options);p.observeHtml(html());p.reserve(origin+target,'GET');
  await p.observeScript(target,Buffer.from('import "./SettingsPage.NEW12345.js";'));
  assert.ok(p.pending().includes('/_astro/SettingsPage.NEW12345.js'));
  assert.throws(()=>p.reserve(origin+'/_astro/Unknown.NEW12345.js','GET'),/UNREFERENCED_ASSET/);
});
test('another hash of an occupied stem is rejected rather than expanding the asset budget',async()=>{
  assert.ok(implementation);const p=new implementation.AssetReadPlan(options);p.observeHtml(html());p.reserve(origin+target,'GET');
  await assert.rejects(p.observeScript(target,Buffer.from('import "./SettingsPage.NEW12345.js"; import "./SettingsPage.NEWHASH2.js";')),/STEM_MULTIPLICITY/);
});
test('cross-origin, arbitrary query, encoded/private paths and unsupported stems stop parsing',()=>{
  assert.ok(implementation);
  for(const path of ['https://other.invalid/_astro/AuthPanel.EZiCXg-9.js','/_astro/AuthPanel.EZiCXg-9.js?token=PRIVATE','/_astro/%41uthPanel.EZiCXg-9.js','/api/private.js','/_astro/PRIVATE.NEW12345.js']){
    const p=new implementation.AssetReadPlan(options);assert.throws(()=>p.observeHtml(Buffer.from(`<script src="${target}"></script><script src="${path}"></script>`)),/ASSET_REFERENCE_FORBIDDEN/);
  }
});
test('unresolved runtime import cannot be claimed as complete production coverage',async()=>{
  assert.ok(implementation);const p=new implementation.AssetReadPlan(options);p.observeHtml(html());p.reserve(origin+target,'GET');
  await assert.rejects(p.observeScript(target,Buffer.from('import(window.PRIVATE_URL);')),/NON_LITERAL_IMPORT/);
});
test('missing observed target is production-reference drift, not permission to probe a stale filename',()=>{
  assert.ok(implementation);const p=new implementation.AssetReadPlan(options);
  assert.throws(()=>p.observeHtml(Buffer.from('<script src="/_astro/AuthPanel.EZiCXg-9.js"></script>')),/TARGET_REFERENCE_CHANGED/);
});
test('POST, auth headers and cookies cannot enter static reads; repeats consume no second dispatch',()=>{
  assert.ok(implementation);
  for(const [method,headers] of [['POST',{}],['GET',{cookie:'PRIVATE'}],['GET',{Authorization:'PRIVATE'}]]){
    const p=new implementation.AssetReadPlan(options);p.observeHtml(html());assert.throws(()=>p.reserve(origin+target,method,headers),/ANONYMOUS_GET_ONLY/);
  }
  const p=new implementation.AssetReadPlan(options);p.observeHtml(html());p.reserve(origin+target,'GET');
  assert.throws(()=>p.reserve(origin+target,'GET'),/ASSET_REPLAY/);
});
test('HTTP 200 fallback, redirects, Cookie and compressed bodies are not static proof',()=>{
  assert.ok(implementation);
  for(const r of [{status:307,headers:{location:'/private'},body:Buffer.from('')},{status:200,headers:{'content-type':'text/html'},body:Buffer.from('fallback')},{status:200,headers:{'content-type':'application/javascript','set-cookie':'PRIVATE'},body:Buffer.from('')},{status:200,headers:{'content-type':'application/javascript','content-encoding':'gzip'},body:Buffer.from('')}])
    assert.throws(()=>implementation.assertStaticResponse('script',r));
});
test('response hashes are observations, not expected-production bytes or repair permission',()=>{
  assert.ok(implementation);const r={status:200,headers:{'content-type':'application/javascript'},body:Buffer.from('export {};')};
  const proof=implementation.assertStaticResponse('script',r);
  assert.match(proof.sha256,/^[a-f0-9]{64}$/);assert.equal(proof.bytes,10);assert.equal(proof.sourceVerified,false);
});
test('bounded public response details exclude raw content and private headers',()=>{
  assert.ok(implementation);const r={status:200,headers:{'content-type':'text/css'},body:Buffer.from('/* PRIVATE */ body{}')};
  assert.doesNotMatch(JSON.stringify(implementation.assertStaticResponse('stylesheet',r)),/PRIVATE|body\{/);
});
