import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import {spawnSync}from'node:child_process';import {fileURLToPath}from'node:url';
import {verifyFrozen}from'./binding.mjs';import {validate,GO,sha}from'./authorization.mjs';
const d=fileURLToPath(new URL('./artifacts/',import.meta.url));
test('frozen packet/profile/native entry match and gates/time stay null',()=>{
 const b=verifyFrozen(d),a=JSON.parse(fs.readFileSync(d+'/AUTHORIZATION_PENDING_NOT_AUTHORIZED.json')),f=JSON.parse(fs.readFileSync(d+'/FREEZE_SAFE.json'));
 assert.equal(b.bindingHash,f.executionBindingSha256);assert.equal(b.packetHash,f.packetSha256);assert.equal(sha(fs.readFileSync(d+'/HUMAN_NATIVE_ISOLATED_MANUAL_AUTHORIZATION_NOT_AUTHORIZED.md')),f.templateSha256);
 assert.equal(b.packet.old65040HardCapInherited,false);assert.equal(b.packet.networkBoundaryEnforcement,'PARTIAL');assert.equal(a.authorizedAtUTC,null);assert.ok(Object.values(a.humanGates).every(x=>x===null));
 assert.throws(()=>validate(a,{...b,go:GO,now:Date.now(),claimExists:false}),/HUMAN_GATES_REQUIRED/);
});
test('original14 mappings/16 RLS counts and exact expectations retained',()=>{
 const f=JSON.parse(fs.readFileSync(d+'/GROUP1_FUTURE_EVIDENCE_PLAN.json')),g=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-full650-chrome-v11/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json',import.meta.url)));
 assert.equal(f.status,'NOT_AUTHORIZED');assert.deepEqual(f.scopedCases.map(x=>x.id),g.requiredCases);assert.deepEqual(f.exactRlsSteps,g.catalogRestRequests);assert.deepEqual(f.loginActions,g.loginActions);
 assert.deepEqual(f.rlsRoleCounts,{anon:6,A:5,B:5});assert.ok(f.scopedCases.every(x=>x.status==='NOT_AUTHORIZED'));
});
test('missing GO cannot create Profile/Claim or contact anything',()=>{
 const q=spawnSync(process.execPath,[fileURLToPath(new URL('./run-manual.mjs',import.meta.url))],{stdio:'ignore',timeout:3000});assert.notEqual(q.status,0);
 for(const n of ['AUTHORIZATION_APPROVED.json','NATIVE_PREFLIGHT_ONCE.json','NATIVE_ONCE.claim','NATIVE_PROFILE_LOCAL_ONLY.json'])assert.equal(fs.existsSync(d+'/'+n),false);
});
