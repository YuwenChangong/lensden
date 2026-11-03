import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticJournal} from './execution/group1/diagnostics.mjs';
import {Group1Gate,SharedBudget} from './execution/group1/gate.mjs';
let mod;try{mod=await import('./execution/group1/script-identity.mjs')}catch{}
const appOrigin='https://app.example.invalid',supabaseOrigin='https://db.example.invalid';
const staticPaths=['/_astro/AuthPanel.EZiCXg-9.js','/_astro/client.C9ykwJRQ.js'];
const caps={allBrowserHttpDispatchesMax:10,executionSecondsMax:300,turnstileHttpDispatchesMax:8};
const binding={userId:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',applicationRole:'user'};
const meta={stage:'LOGIN_A',source:'BROWSER_RESOURCE',resourceType:'script'};
const request=(route,extra={})=>({url:appOrigin+route,method:'GET',actor:'A',headers:{},body:Buffer.alloc(0),...extra});
const options={actor:'A',appOrigin,supabaseOrigin,staticPaths,readOnlyLoginDiagnostic:true};
function gate(){return new Group1Gate({...options,binding,caps,budget:new SharedBudget(caps)})}
test('safe public-reference classifier exists',()=>assert.equal(typeof mod?.ScriptIdentityEvidence,'function'));
test('exact local manifest match is distinguished from unknown build hash',async()=>{
  assert.ok(mod);const e=new mod.ScriptIdentityEvidence(options);
  assert.equal(e.describe(request(staticPaths[0]),meta).status,'MANIFEST_MATCH');
  await e.observeLoginHtml(Buffer.from('<script src="/_astro/AuthPanel.NEW12345.js"></script>'),appOrigin+'/login/');
  const result=e.describe(request('/_astro/AuthPanel.NEW12345.js'),meta);
  assert.equal(result.status,'PUBLIC_REFERENCE_UNMATCHED');
  assert.equal(result.publicPathname,'/_astro/AuthPanel.NEW12345.js');
  assert.equal(result.referenceSource,'VALIDATED_LOGIN_HTML');
  assert.equal(result.contentVerified,false);
});
test('a target completely absent from manifest is identifiable from reviewed finite stem and public page reference',async()=>{
  assert.ok(mod);const e=new mod.ScriptIdentityEvidence(options);
  await e.observeLoginHtml(Buffer.from('<astro-island component-url="/_astro/AuthPanel.DIFFER01.js" renderer-url="/_astro/client.DIFFER02.js"></astro-island>'),appOrigin+'/login/');
  for(const name of ['AuthPanel.DIFFER01','client.DIFFER02']){
    const d=e.describe(request('/_astro/'+name+'.js'),meta);
    assert.equal(d.status,'PUBLIC_REFERENCE_UNMATCHED');assert.equal(d.publicPathname,'/_astro/'+name+'.js');
  }
});
test('literal dynamic import from verified bound script is identifiable without requesting target',async()=>{
  assert.ok(mod);const e=new mod.ScriptIdentityEvidence(options);
  await e.observeBoundScript(Buffer.from('export const load=()=>import("./AuthPanel.FUTURE01.js");'),appOrigin+staticPaths[1]);
  const d=e.describe(request('/_astro/AuthPanel.FUTURE01.js'),meta);
  assert.equal(d.publicPathname,'/_astro/AuthPanel.FUTURE01.js');assert.equal(d.referenceSource,'VERIFIED_BOUND_SCRIPT_IMPORT');
});
test('query, fragment, credentials and token-like private paths are not disclosed',async()=>{
  assert.ok(mod);const e=new mod.ScriptIdentityEvidence(options);
  await e.observeLoginHtml(Buffer.from('<script src="/_astro/AuthPanel.NEW12345.js?token=PRIVATE_QUERY#PRIVATE_FRAGMENT"></script><script src="/_astro/PRIVATE_ID.SECRET01.js"></script><script src="/api/PRIVATE_ID/token.js"></script>'),appOrigin+'/login/');
  const safe=e.describe(request('/_astro/AuthPanel.NEW12345.js?token=PRIVATE_QUERY#PRIVATE_FRAGMENT'),meta);
  assert.equal(safe.publicPathname,'/_astro/AuthPanel.NEW12345.js');
  for(const path of ['/_astro/PRIVATE_ID.SECRET01.js','/api/PRIVATE_ID/token.js','/_astro/AuthPanel.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.js','/_astro/%41uthPanel.NEW12345.js']){
    const d=e.describe(request(path),meta);assert.equal(d.status,'PRIVACY_BLOCKED');assert.equal(d.publicPathname,null);
  }
  const credential=e.describe(request('/_astro/AuthPanel.NEW12345.js',{url:'https://PRIVATE:SECRET@app.example.invalid/_astro/AuthPanel.NEW12345.js'}),meta);
  assert.equal(credential.status,'PRIVACY_BLOCKED');assert.doesNotMatch(JSON.stringify([safe,credential]),/PRIVATE|SECRET|token=|#|https:/);
});
test('same-origin GET script syntax alone and unverified source are never enough',async()=>{
  assert.ok(mod);const e=new mod.ScriptIdentityEvidence(options);
  assert.equal(e.describe(request('/_astro/AuthPanel.NEW12345.js'),meta).status,'PRIVACY_BLOCKED');
  await e.observeLoginHtml(Buffer.from('<script src="/_astro/AuthPanel.NEW12345.js"></script>'),appOrigin+'/products/');
  await e.observeBoundScript(Buffer.from('import "./AuthPanel.NEW12345.js";'),appOrigin+'/_astro/unbound.js');
  assert.equal(e.describe(request('/_astro/AuthPanel.NEW12345.js'),meta).status,'PRIVACY_BLOCKED');
});
test('other origins, actors, stages and methods cannot disclose public candidates',async()=>{
  assert.ok(mod);const e=new mod.ScriptIdentityEvidence(options);
  await e.observeLoginHtml(Buffer.from('<script src="/_astro/AuthPanel.NEW12345.js"></script>'),appOrigin+'/login/');
  for(const [q,m] of [[request('/_astro/AuthPanel.NEW12345.js',{actor:'B'}),meta],[request('/_astro/AuthPanel.NEW12345.js'),{...meta,stage:'LOGIN_B'}],[request('/_astro/AuthPanel.NEW12345.js',{method:'POST'}),meta],[request('/_astro/AuthPanel.NEW12345.js',{url:'https://other.invalid/_astro/AuthPanel.NEW12345.js'}),meta]])
    assert.equal(e.describe(q,m).status,'PRIVACY_BLOCKED');
});
test('journal propagates exact safe identity and fingerprint but does not admit legitimate unbound script',async()=>{
  const j=new DiagnosticJournal(options);assert.equal(typeof j.observeLoginHtml,'function');
  await j.observeLoginHtml(Buffer.from('<script src="/_astro/AuthPanel.NEW12345.js"></script>'),appOrigin+'/login/');
  const g=gate();assert.throws(()=>j.reserve(g,request('/_astro/AuthPanel.NEW12345.js'),meta),/DIAGNOSTIC_ROUTE_FORBIDDEN/);
  const d=j.receipt().firstRejection;assert.equal(d.scriptIdentity.publicPathname,'/_astro/AuthPanel.NEW12345.js');
  assert.equal(d.scriptIdentity.status,'PUBLIC_REFERENCE_UNMATCHED');assert.match(d.scriptPathSha256,/^[a-f0-9]{64}$/);
  assert.equal(d.networkDispatchOccurred,false);assert.equal(g.receipt().counts.allBrowserHttpDispatchesMax,0);
});
