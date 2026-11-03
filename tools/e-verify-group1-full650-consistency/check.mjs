import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ID, GO, HUMAN_GATES, validateAuthorization, verifyFiles} from '../e-verify-group1-full650/authorization.mjs';
import {assertPacket, checkOAuth, validateLocal} from '../e-verify-group1-full650/policy.mjs';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';

const folder=fileURLToPath(new URL('../e-verify-group1-full650/',import.meta.url));
const artifacts=path.join(folder,'artifacts');
const read=name=>fs.readFileSync(path.join(artifacts,name));
const packetBytes=read('GROUP1_PACKET_NOT_AUTHORIZED.json');
const bindingBytes=read('EXECUTION_BINDING_GROUP1.json');
const packet=JSON.parse(packetBytes),binding=JSON.parse(bindingBytes);
const pending=JSON.parse(read('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json'));
const amendment=JSON.parse(read('BUDGET_AMENDMENT_APPLIED_SAFE.json'));
const now=Date.parse('2030-01-01T00:00:01Z');
// Synthetic authorization exists only in memory; it is never an owner approval.
const fixture={...pending,authorizedAtUTC:'2030-01-01T00:00:00Z',authorizationExpiresUTC:'2030-01-01T01:00:00Z',humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,true]))};
const options={packet,packetSha256:sha(packetBytes),bindingSha256:sha(bindingBytes),now,go:GO,claimExists:false};
const tests=[];
const test=(name,fn)=>tests.push({name,fn});

test('one private field changed; original500 preserved',()=>{
 const oldBytes=fs.readFileSync(binding.preservedOldPrivateBindingPath);
 const newBytes=fs.readFileSync(binding.privateBindingPath);
 assert.equal(sha(oldBytes),amendment.oldPrivateSha256);
 assert.equal(sha(newBytes),amendment.newPrivateSha256);
 const before=JSON.parse(oldBytes),after=JSON.parse(newBytes);
 assert.equal(before.budget.allBrowserHttpDispatchesMax,500);
 assert.equal(after.budget.allBrowserHttpDispatchesMax,650);
 const expected=structuredClone(before);expected.budget.allBrowserHttpDispatchesMax=650;
 assert.deepEqual(after,expected);
 assert.equal(after.budget.openaiAndProviderCostUSDMax,0);
 for(const k of ['authorizedAtUTC','authorizationExpiresUTC','operatorAvailableForEntireValidity'])assert.equal(after.human[k],null);
});
test('complete frozen execution closure has zero differences',()=>assert.equal(verifyFiles(binding.files),true));
test('original14 scope and16 RLS plus all class budgets unchanged',()=>assert.equal(assertPacket(packet,binding),true));
test('newID binding and Packet hashes match pending JSON',()=>{
 assert.equal(pending.authorizationId,ID);
 assert.equal(pending.packetSha256,sha(packetBytes));
 assert.equal(pending.executionBindingSha256,sha(bindingBytes));
 assert.equal(binding.authorizationId,ID);
 assert.equal(pending.authorizedAtUTC,null);assert.equal(pending.authorizationExpiresUTC,null);
 assert.deepEqual(Object.keys(pending.humanGates),HUMAN_GATES);
 assert.ok(Object.values(pending.humanGates).every(v=>v===null));
});
test('full local validation with in-memory fixture only',()=>assert.equal(validateLocal({auth:fixture,packet,binding,packetBytes,bindingBytes,go:GO,now,claimExists:false}),true));
test('null gates, oldID, oldGO and consumed Claim rejected',()=>{
 assert.throws(()=>validateAuthorization(pending,options));
 assert.throws(()=>validateAuthorization({...fixture,authorizationId:'e-verify-group1-openglasshub-20261013-free-plan-v2'},options));
 assert.throws(()=>validateAuthorization(fixture,{...options,go:'GO_E_VERIFY_GROUP1_V1'}));
 assert.throws(()=>validateAuthorization(fixture,{...options,claimExists:true}));
});
test('expired, insufficient execution coverage and extended validity rejected',()=>{
 assert.throws(()=>validateAuthorization(fixture,{...options,now:Date.parse(fixture.authorizationExpiresUTC)}));
 assert.throws(()=>validateAuthorization(fixture,{...options,now:Date.parse(fixture.authorizationExpiresUTC)-1800000}));
 assert.throws(()=>validateAuthorization({...fixture,authorizationExpiresUTC:'2030-01-01T01:00:01Z'},options));
});
test('OAuth fixtures strictly require scopes and more than1860s',()=>{
 const c={oauth_token:'NONSECRET_OFFLINE_FIXTURE',scopes:['account:read','workers_scripts:write'],expiration_time:new Date(now+1861000).toISOString()};
 assert.equal(checkOAuth(c,now),true);
 assert.throws(()=>checkOAuth({...c,oauth_token:''},now),/OAUTH_TOKEN_ABSENT/);
 assert.throws(()=>checkOAuth({...c,scopes:['account:read']},now),/OAUTH_SCOPES/);
 assert.throws(()=>checkOAuth({...c,expiration_time:new Date(now+1860000).toISOString()},now),/OAUTH_COVERAGE/);
 assert.throws(()=>checkOAuth({...c,expiration_time:'invalid'},now),/OAUTH_COVERAGE/);
});
test('actual parent noGO invocation creates no state',()=>{
 const before=fs.readdirSync(artifacts).sort();
 const result=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{cwd:folder,encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:'',APPDATA:path.join(folder,'NO_OAUTH_FIXTURE_DIRECTORY')}});
 assert.equal(result.status,1);
 assert.equal(JSON.parse(result.stdout.trim()).firstFailure,'EXACT_GO_REQUIRED');
 assert.deepEqual(fs.readdirSync(artifacts).sort(),before);
});
test('actual full parent and child syntax checked without invocation',()=>{
 for(const name of ['entry.mjs','child.mjs'])assert.equal(spawnSync(process.execPath,['--check',path.join(folder,name)],{windowsHide:true,encoding:'utf8',timeout:15000}).status,0);
});
test('full runner browser adapter and original native supervisor wired',()=>{
 const child=fs.readFileSync(path.join(folder,'child.mjs'),'utf8');
 const parent=fs.readFileSync(path.join(folder,'entry.mjs'),'utf8');
 assert.ok(child.includes('result=await runBoundGroup1('));
 assert.ok(child.includes('{manifest:packet.staticManifest,htmlHashes,openBrowser}'));
 assert.ok(child.includes('await waitForStart()'));
 assert.ok(parent.includes("'../e-verify-group1-remaining-assets/supervisor.mjs'"));
 assert.ok(!child.includes('runDiagnostic'));
 assert.ok(parent.indexOf('validateLocal(')<parent.indexOf('const credential=loadDefaultOAuth()'));
 assert.ok(parent.indexOf('checkOAuth(credential,Date.now())')<parent.indexOf('claimOnce(claim'));
});
test('13 conditions and exact newGO with no approved file or Claim',()=>{
 const template=read('HUMAN_FULL_GROUP1_650_AUTHORIZATION_NOT_AUTHORIZED.md').toString();
 const conditions=template.split('## Thirteen Conditions')[1].split('## Shortest Next Step')[0];
 assert.equal([...conditions.matchAll(/^\d+\. /gm)].length,13);
 assert.ok(template.includes('all client/browser admissions 650'));
 assert.ok(template.includes(GO));
 for(const name of ['AUTHORIZED_GROUP1.json','GROUP1_ONCE.claim','GROUP1_EXECUTION_SAFE.json','GROUP1_LOCAL_FAILURE_SAFE.json'])assert.equal(fs.existsSync(path.join(artifacts,name)),false);
});

const failures=[];
for(const {name,fn} of tests){try{fn()}catch{failures.push(name)}}
const report={status:failures.length?'BLOCKED':'PASS',testsPassed:tests.length-failures.length,testsTotal:tests.length,failedTestNames:failures,
 frozenFileCount:binding.files.length,budgetAmendment:'500_TO_650_ONLY',humanGates:'5_NULL',formalTimes:'NULL',
 liveOAuthRead:false,productionRequests:0,productionWrites:0,claimCreated:false,go:'NOT_ISSUED',
 executionBindingSha256:sha(bindingBytes),packetSha256:sha(packetBytes),templateSha256:sha(read('HUMAN_FULL_GROUP1_650_AUTHORIZATION_NOT_AUTHORIZED.md'))};
const output=fileURLToPath(new URL('./CONSISTENCY_CORRECTED_SAFE.json',import.meta.url));
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify(report)+'\n');
if(failures.length)process.exitCode=1;
