import fs from 'node:fs';import {createHash} from 'node:crypto';
export const ID='e-verify-turnstile-isolated-openglasshub-20261014-b1';
export const GO='GO_E_VERIFY_TURNSTILE_ISOLATED_TEST_V1';
export const GATES=Object.freeze(['boundedVendorTrustAndResidualRiskAccepted','isolatedOfficialTestKeyOnlyConfirmed','freeOnlyZeroAdditionalCostConfirmed','diagnosticLogsAndPrivacyBoundaryAccepted','operatorAvailableForEntireValidity']);
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function validate(a,{packetHash,bindingHash,now,go,claimExists}){
 const keys=['format','authorizationId','packetSha256','executionBindingSha256','authorizedAtUTC','authorizationExpiresUTC','humanGates'];
 if(!a||Object.keys(a).sort().join('|')!==keys.sort().join('|')||a.format!=='isolated-turnstile-authorization-v1'||a.authorizationId!==ID||a.packetSha256!==packetHash||a.executionBindingSha256!==bindingHash||go!==GO||claimExists!==false)throw new Error('AUTHORIZATION_INVALID');
 if(!a.humanGates||Object.keys(a.humanGates).sort().join('|')!==GATES.slice().sort().join('|')||GATES.some(k=>a.humanGates[k]!==true))throw new Error('HUMAN_GATES_REQUIRED');
 const parse=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(Date.parse(s)).toISOString().replace('.000Z','Z')!==s.replace('.000Z','Z'))throw new Error('UTC_INVALID');return Date.parse(s)};
 const start=parse(a.authorizedAtUTC),end=parse(a.authorizationExpiresUTC);if(!Number.isFinite(now)||end<=start||end-start>3600000||now<start||now+310000>=end)throw new Error('WINDOW_COVERAGE');return true;
}
export function claimOnce(file){const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,ID+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
