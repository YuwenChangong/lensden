import fs from 'node:fs';import {sha256} from './hash.mjs';
export const GO='GO_E_VERIFY_GROUP1_PRODUCTION_ASSET_PROOF_V1';
export const HUMAN_GATES=Object.freeze(['subsetBoundary2AndResidualCasesAccepted','authSecurityLogSideEffectsAccepted','manualTurnstileAndPrivateIdentityReady','catalogHoldAndPostHardeningRecoveryAccepted','operatorAvailableForEntireValidity']);
const fail=()=>{throw new Error('GROUP1_AUTHORIZATION_INVALID')};
const utc=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s))fail();const t=Date.parse(s);if(!Number.isFinite(t)||new Date(t).toISOString().replace('.000Z','Z')!==s.replace('.000Z','Z'))fail();return t};
export function validateAuthorization(a,{packet,packetSha256,bindingSha256,now,go,claimExists}){
 if(!a||typeof a!=='object'||Object.keys(a).sort().join('|')!==['format','authorizationId','packetSha256','executionBindingSha256','authorizedAtUTC','authorizationExpiresUTC','humanGates'].sort().join('|')||
  a.format!=='e-verify-group1-authorization-v1'||a.authorizationId!==packet.authorizationId||a.packetSha256!==packetSha256||a.executionBindingSha256!==bindingSha256||go!==GO||claimExists!==false||!Number.isFinite(now))fail();
 if(!Number.isSafeInteger(packet.executionLimitSeconds)||packet.executionLimitSeconds<=0||!a.humanGates||Object.keys(a.humanGates).sort().join('|')!==HUMAN_GATES.slice().sort().join('|')||HUMAN_GATES.some(k=>a.humanGates[k]!==true))fail();
 const start=utc(a.authorizedAtUTC),end=utc(a.authorizationExpiresUTC);
 if(end<=start||end-start>3600000||now<start||now+packet.executionLimitSeconds*1000>=end)fail();return true;
}
export function verifyFiles(files){if(!Array.isArray(files)||!files.length)throw new Error('GROUP1_BINDING_MISSING');for(const f of files)if(!/^[a-f0-9]{64}$/.test(f.sha256)||sha256(fs.readFileSync(f.path))!==f.sha256)throw new Error('GROUP1_BINDING_DRIFT');return true}
export function claimOnce(file,id){if(!/^e-verify-group1-[a-z0-9-]+$/.test(id))throw new Error('GROUP1_CLAIM_ID_INVALID');const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,id+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
