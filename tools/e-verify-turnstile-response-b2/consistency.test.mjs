import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';
import {spawnSync}from'node:child_process';
import {fileURLToPath}from'node:url';
import {verifyFrozen}from'./binding.mjs';
import {validate,GO,sha}from'./authorization.mjs';
const d=fileURLToPath(new URL('./artifacts/',import.meta.url));
test('new B2 frozen files match and no effective authorization exists',()=>{
 const b=verifyFrozen(d),a=JSON.parse(fs.readFileSync(d+'/AUTHORIZATION_PENDING_NOT_AUTHORIZED.json')),f=JSON.parse(fs.readFileSync(d+'/FREEZE_SAFE.json'));
 assert.equal(f.executionBindingSha256,b.bindingHash);assert.equal(f.packetSha256,b.packetHash);
 assert.equal(sha(fs.readFileSync(d+'/HUMAN_B2_SDK_RESPONSE_AUTHORIZATION_NOT_AUTHORIZED.md')),f.templateSha256);
 assert.equal(b.packet.budgets.thirdParty,1);assert.equal(b.packet.budgets.global,650);assert.equal(b.packet.sdkExecutionAllowed,false);
 assert.equal(a.authorizedAtUTC,null);assert.equal(a.authorizationExpiresUTC,null);assert.ok(Object.values(a.humanGates).every(x=>x===null));
 assert.throws(()=>validate(a,{...b,now:Date.now(),go:GO,claimExists:false}),/HUMAN_GATES_REQUIRED/);
});
test('missing GO entry fails before Claim and leaves both instances untouched',()=>{
 const old=new URL('../e-verify-turnstile-isolated/artifacts/ONLINE_ONCE.claim',import.meta.url),before=sha(fs.readFileSync(old));
 const q=spawnSync(process.execPath,[fileURLToPath(new URL('./run-online.mjs',import.meta.url))],{stdio:'ignore',timeout:3000});assert.notEqual(q.status,0);
 assert.equal(sha(fs.readFileSync(old)),before);
 for(const n of ['AUTHORIZATION_APPROVED.json','ONLINE_PREFLIGHT_ONCE.json','ONLINE_ONCE.claim'])assert.equal(fs.existsSync(d+'/'+n),false);
});
