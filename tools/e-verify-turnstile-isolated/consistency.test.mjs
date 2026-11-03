import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync}from'node:child_process';
import {fileURLToPath}from'node:url';
import {verifyFrozen}from'./binding.mjs';
import {ID,validate,GO,GATES}from'./authorization.mjs';
const directory=fileURLToPath(new URL('./artifacts/',import.meta.url));
test('frozen actual runtime and all files match; pending never authorizes',()=>{
 const b=verifyFrozen(directory),a=JSON.parse(fs.readFileSync(directory+'/AUTHORIZATION_PENDING_NOT_AUTHORIZED.json'));
 assert.equal(b.packet.authorizationId,ID);assert.equal(b.packet.maxAdditionalCostUSD,0);assert.equal(b.packet.preClearance,false);
 for(const k of GATES)assert.equal(a.humanGates[k],null);
 assert.equal(a.authorizedAtUTC,null);assert.equal(a.authorizationExpiresUTC,null);
 assert.throws(()=>validate(a,{...b,now:Date.now(),go:GO,claimExists:false}),/HUMAN_GATES_REQUIRED/);
});
test('no GO invocation cannot create live preflight or Claim',()=>{
 const q=spawnSync(process.execPath,[fileURLToPath(new URL('./run-online.mjs',import.meta.url))],{stdio:'ignore',timeout:3000});
 assert.notEqual(q.status,0);
 for(const name of ['ONLINE_PREFLIGHT_ONCE.json','ONLINE_ONCE.claim','AUTHORIZATION_APPROVED.json'])assert.equal(fs.existsSync(directory+'/'+name),false);
});
