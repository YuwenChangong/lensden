import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GO,HUMAN_GATES,validateAuthorization,claimOnce} from './authorization.mjs';import {assertPacket,CAPS,ID} from './preflight.mjs';
import {AssetReadPlan} from './dependency-policy.mjs';import {buildScope} from './scope.mjs';import {analyzeBudgetAndCases} from './analysis.mjs';
import {ReadBudget} from '../e-verify-group1-asset-reader-fresh-v8/reader.mjs';import {loadReuse} from './reuse.mjs';
import {SharedBudget} from '../e-verify-group1-script-identity/execution/group1/gate.mjs';
import {validateDeployment} from 'file:///C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/read-only-policy.mjs';
const scope=buildScope(),analysis=analyzeBudgetAndCases(scope);
const p=()=>JSON.parse(fs.readFileSync(new URL('./artifacts/ASSET_READ_PACKET_NOT_AUTHORIZED.json',import.meta.url)));
test('finite scope is original23 plus6 missing roots/deps and1 exact compiled inline contingency',()=>{
 assert.equal(scope.manifest.length,30);assert.equal(scope.reusedAssets.length,23);assert.equal(scope.remainingSlots.length,7);
 assert.equal(scope.inlineContingency.bytes,285);assert.ok(scope.edgeRules['/products/'].includes('/_astro/index.css'));
 assert.ok(scope.edgeRules['/_astro/AdminDevicesDashboard.js'].includes('/_astro/GlassConfirmDialog.js'));
});
test('actual owner private budget equals frozen zero-dollar budget without account output',()=>{
 assert.equal(analysis.budget.privateBudgetMatchesFrozenPacket,true);assert.equal(analysis.ownerBudgets.openaiAndProviderCostUSDMax,0);
 assert.equal(analysis.ownerBudgets.allBrowserHttpDispatchesMax,500);assert.equal(analysis.cases.caseCount,14);assert.equal(analysis.cases.authenticatedRLSReads,16);
 assert.equal(analysis.budget.requestBudget,'UNKNOWN');assert.ok(analysis.budget.conservativeGlobalUpper>500);
});
test('new read budget is12 within70,3 HTML and7 conditional asset slots, original byte limits',()=>{
 assert.equal(CAPS.totalGETMax,12);assert.equal(CAPS.htmlGETMax,3);assert.equal(CAPS.assetGETMax,7);assert.equal(CAPS.anonymousAggregateBytesMax,16777216);
 assertPacket(p());assert.throws(()=>assertPacket({...p(),pages:['/forum/']}));assert.throws(()=>assertPacket({...p(),authorizationId:'consumed-v8'}));
});
test('source edge restrictions deny unused whole-site components even when same-origin referenced',()=>{
 const plan=new AssetReadPlan({origin:'https://openglasshub.ogh.workers.dev',manifest:scope.manifest,requiredTarget:'/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js',edgeRules:scope.edgeRules});
 assert.throws(()=>plan.observeHtml(Buffer.from('<script src="/_astro/ReportTrigger.ABCDEFGH.js"></script>'),'/products/'));
});
test('uppercase CSS IMPORT cannot bypass finite source graph validation',()=>{
 const origin='https://openglasshub.ogh.workers.dev',header='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js',css='/_astro/index.ABCDEFGH.css';
 const plan=new AssetReadPlan({origin,manifest:[{path:header},{path:css}],requiredTarget:header,
  edgeRules:{'/login/':['/_astro/SiteHeader.astro_astro_type_script_index_0_lang.js','/_astro/index.css'],'/_astro/index.css':[]}});
 plan.observeHtml(Buffer.from(`<script src="${header}"></script><link rel="stylesheet" href="${css}">`));plan.reserve(origin+css,'GET');
 assert.throws(()=>plan.observeStylesheet(css,Buffer.from('@IMPORT "https://other.invalid/a.css";')));
});
const auth={format:'e-verify-group1-authorization-v1',authorizationId:ID,packetSha256:'1'.repeat(64),executionBindingSha256:'2'.repeat(64),authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T00:30:00Z',humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,true]))};
const ctx={packet:{authorizationId:ID,executionLimitSeconds:300},packetSha256:auth.packetSha256,bindingSha256:auth.executionBindingSha256,now:Date.parse('2026-10-13T00:01:00Z'),go:GO,claimExists:false};
test('new authorization expiry, missing gate, wrong GO/binding and consumed state all fail before dispatch',()=>{
 assert.equal(validateAuthorization(auth,ctx),true);
 for(const x of [{...ctx,now:Date.parse('2026-10-13T00:26:00Z')},{...ctx,claimExists:true},{...ctx,go:'GO_E_VERIFY_GROUP1_PRODUCTION_ASSET_PROOF_FRESH_V8'},{...ctx,bindingSha256:'3'.repeat(64)}])assert.throws(()=>validateAuthorization(auth,x));
 assert.throws(()=>validateAuthorization({...auth,humanGates:{...auth.humanGates,operatorAvailableForEntireValidity:null}},ctx));
});
test('local fixture Claim is exclusive; no Production Claim created',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-fixture-claim-')),f=path.join(d,'fixture.claim');
 try{claimOnce(f,'e-verify-group1-local-fixture');assert.throws(()=>claimOnce(f,'e-verify-group1-local-fixture'))}finally{fs.rmSync(f);fs.rmdirSync(d)}
});
test('actual new entry without GO stops before credentials, Claim and network',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('./entry.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:5000,env:{SystemRoot:process.env.SystemRoot}});
 assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).firstFailure,'EXACT_GO_REQUIRED');
 assert.equal(fs.existsSync(new URL('./artifacts/ASSET_READ_ONCE.claim',import.meta.url)),false);
 assert.equal(fs.existsSync(new URL('./artifacts/AUTHORIZED_ASSET_READ.json',import.meta.url)),false);
});
test('all23 previously acquired bodies seed current finite graph without any network capability',async()=>{
 const seed=loadReuse(),plan=new AssetReadPlan({origin:'https://openglasshub.ogh.workers.dev',manifest:scope.manifest,requiredTarget:'/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js',edgeRules:scope.edgeRules});
 plan.observeHtml(seed.html);for(const a of seed.assets){plan.reserve('https://openglasshub.ogh.workers.dev'+a.path,'GET');
  if(a.kind==='script')await plan.observeScript(a.path,a.body);else plan.observeStylesheet(a.path,a.body);
 }assert.equal(seed.assets.length,23);assert.equal(plan.pending().length,0);
});
test('four concurrent reservations leave no fifth read slot; failed reservations do not dispatch',async()=>{
 const b=new ReadBudget(CAPS),tickets=[];let admitted=0;
 await Promise.all(Array.from({length:5},async()=>{try{tickets.push(b.reserve('asset'));admitted++}catch{}}));
 assert.equal(admitted,4);assert.equal(b.receipt().total,4);for(const t of tickets)b.release(t);
});
test('actual GROUP_1 global and refresh caps remain atomic using owner-saved budgets',()=>{
 const b=new SharedBudget(analysis.ownerBudgets);for(let i=0;i<6;i++)b.reserve(['allBrowserHttpDispatchesMax','supabaseAuthDispatchesMax','ownerSessionRefreshRequestsMax']);
 assert.throws(()=>b.reserve(['allBrowserHttpDispatchesMax','supabaseAuthDispatchesMax','ownerSessionRefreshRequestsMax']));
 assert.equal(b.receipt().allBrowserHttpDispatchesMax,6);
 const c=new SharedBudget(analysis.ownerBudgets);for(let i=0;i<500;i++)c.reserve(['allBrowserHttpDispatchesMax']);assert.throws(()=>c.reserve(['allBrowserHttpDispatchesMax']));assert.equal(c.receipt().allBrowserHttpDispatchesMax,500);
});
test('actual Provider schema rejects version/traffic changes and Location; legitimate response cookie ignored only after validation',()=>{
 const data={success:true,errors:[],result:[{id:'e8481d68-d2d5-473b-8b0c-b82b8fa33fc3',created_on:'2026-10-11T08:20:59Z',versions:[{version_id:'b2b62ec9-bb8d-4159-ac99-08fca5740134',percentage:100}]}]},h={'content-type':'application/json','set-cookie':'SYNTHETIC_NOT_PERSISTED'};
 assert.equal(validateDeployment(200,h,Buffer.from(JSON.stringify(data))).setCookiePresent,true);
 assert.throws(()=>validateDeployment(200,{...h,location:'/changed'},Buffer.from(JSON.stringify(data))));
 data.result[0].versions[0].percentage=99;assert.throws(()=>validateDeployment(200,h,Buffer.from(JSON.stringify(data))));
});
