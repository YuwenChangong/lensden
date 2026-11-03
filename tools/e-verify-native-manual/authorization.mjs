import fs from'node:fs';import {createHash}from'node:crypto';
export const ID='e-verify-native-turnstile-manual-openglasshub-20261014-v1';
export const GO='GO_E_VERIFY_NATIVE_CHROME_ISOLATED_MANUAL_V1';
export const GATES=['nativePartialControlsAndSoftStopAccepted','isolatedNoCredentialsOfficialTestKeyConfirmed','zeroCostFreeScopeAndUnmeteredConnectionConfirmed','vendorEphemeralStateAndSafeEvidenceAccepted','trustedEnvironmentAndCleanupReady','operatorAvailableForEntireValidity'];
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function validate(a,{bindingHash,packetHash,now=Date.now(),go,claimExists}){
 const keys=['format','authorizationId','executionBindingSha256','packetSha256','authorizedAtUTC','authorizationExpiresUTC','humanGates'];
 if(!a||Object.keys(a).sort().join('|')!==keys.sort().join('|')||a.format!=='native-turnstile-manual-authorization-v1'||a.authorizationId!==ID||a.executionBindingSha256!==bindingHash||a.packetSha256!==packetHash||go!==GO||claimExists!==false)throw new Error('AUTHORIZATION_INVALID');
 if(!a.humanGates||Object.keys(a.humanGates).sort().join('|')!==GATES.slice().sort().join('|')||GATES.some(k=>a.humanGates[k]!==true))throw new Error('HUMAN_GATES_REQUIRED');
 const utc=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(Date.parse(s)).toISOString().replace('.000Z','Z')!==s)throw new Error('UTC_INVALID');return Date.parse(s)};
 const start=utc(a.authorizedAtUTC),end=utc(a.authorizationExpiresUTC);if(!Number.isFinite(now)||end-start<=0||end-start>3600000||now<start||now+610000>=end)throw new Error('WINDOW_COVERAGE');
}
export function claimOnce(file){const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,ID+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
