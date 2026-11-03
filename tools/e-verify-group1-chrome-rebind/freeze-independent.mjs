import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
import {verifyHistoricalFiles,CHROME_PATH,NEW_CHROME_SHA} from './chrome-identity.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),oldRoot=fileURLToPath(new URL('../e-verify-group1-full650/',import.meta.url));
const newRoot=fileURLToPath(new URL('../e-verify-group1-full650-chrome-v11/',import.meta.url));
const oldArtifacts=path.join(oldRoot,'artifacts'),out=path.join(newRoot,'artifacts');
if(fs.existsSync(newRoot))throw new Error('CHROME_REBIND_ALREADY_EXISTS');
const oldBindingBytes=fs.readFileSync(path.join(oldArtifacts,'EXECUTION_BINDING_GROUP1.json'));
const oldPacketBytes=fs.readFileSync(path.join(oldArtifacts,'GROUP1_PACKET_NOT_AUTHORIZED.json'));
const oldTemplateBytes=fs.readFileSync(path.join(oldArtifacts,'HUMAN_FULL_GROUP1_650_AUTHORIZATION_NOT_AUTHORIZED.md'));
assert.equal(sha(oldBindingBytes),'52ddb07a40dcfaafdd5570cd6708d372fd5e1aa04efe54233bfc52942c3e616c');
assert.equal(sha(oldPacketBytes),'644255e484c4f79e4e967a562bc3c0b3b2173994a39f10ad5176a37cfe39cdd6');
assert.equal(sha(oldTemplateBytes),'aff750c20661e3dc63508a571ecfa0fd4525e69d4f3c959cef5df9c0cde61302');
const oldBinding=JSON.parse(oldBindingBytes),oldPacket=JSON.parse(oldPacketBytes);
assert.equal(oldBinding.files.length,2051);verifyHistoricalFiles(oldBinding.files);
const identity=JSON.parse(fs.readFileSync(path.join(here,'artifacts','CHROME_IDENTITY_LOCAL_SAFE.json')));
assert.equal(identity.status,'PASS');assert.equal(identity.signatureStatus,'Valid');assert.equal(identity.publisher,'Google LLC');assert.equal(identity.sha256,NEW_CHROME_SHA);assert.equal(identity.registeredVersion,identity.version);
const tests=JSON.parse(fs.readFileSync(path.join(here,'artifacts','CHROME_TARGETED_TESTS_SAFE.json')));assert.equal(tests.targetedBrowserTestsPassed,6);assert.equal(tests.status,'PASS');
const id='e-verify-group1-openglasshub-20261014-full650-chrome-v11',go='GO_E_VERIFY_GROUP1_FULL650_CHROME_V11';
fs.mkdirSync(out,{recursive:true});
for(const name of ['authorization.mjs','entry.mjs','child.mjs','policy.mjs']){
 let code=fs.readFileSync(path.join(oldRoot,name),'utf8').replaceAll('e-verify-group1-openglasshub-20261014-full650-v10',id).replaceAll('GO_E_VERIFY_GROUP1_FULL650_V10',go);
 if(name==='child.mjs'){const old="'../e-verify-group1-v9-closure/review.mjs'";assert.equal(code.split(old).length,2);code=code.replace(old,"'../e-verify-group1-chrome-rebind/review-rebound.mjs'")}
 fs.writeFileSync(path.join(newRoot,name),code,{flag:'wx'});
}
fs.writeFileSync(path.join(newRoot,'.gitattributes'),'* -text\n',{flag:'wx'});
const packet=structuredClone(oldPacket);packet.authorizationId=id;
const write=(name,bytes)=>{if(!Buffer.isBuffer(bytes))bytes=Buffer.from(JSON.stringify(bytes,null,2)+'\n');fs.writeFileSync(path.join(out,name),bytes,{flag:'wx'});return sha(bytes)};
const packetSha=write('GROUP1_PACKET_NOT_AUTHORIZED.json',packet);
write('OWNER_FREE_PLAN_EVIDENCE.json',fs.readFileSync(path.join(oldArtifacts,'OWNER_FREE_PLAN_EVIDENCE.json')));
const files=new Map(oldBinding.files.map(f=>[path.resolve(f.path).replaceAll('\\','/').toLowerCase(),{...f,...(path.resolve(f.path).toLowerCase()===path.resolve(CHROME_PATH).toLowerCase()?{sha256:NEW_CHROME_SHA}:{})}]));
function add(p){p=path.resolve(p).replaceAll('\\','/');files.set(p.toLowerCase(),{path:p,sha256:sha(fs.readFileSync(p))})}
for(const name of fs.readdirSync(newRoot)){const p=path.join(newRoot,name);if(fs.statSync(p).isFile())add(p)}
function addTree(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())addTree(p);else add(p)}}
addTree(here);addTree(out);
for(const name of ['EXECUTION_BINDING_GROUP1.json','GROUP1_PACKET_NOT_AUTHORIZED.json','HUMAN_FULL_GROUP1_650_AUTHORIZATION_NOT_AUTHORIZED.md'])add(path.join(oldArtifacts,name));
const binding={...oldBinding,authorizationId:id,packetSha256:packetSha,files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),
 previousBindingSha256:sha(oldBindingBytes),previousPacketSha256:sha(oldPacketBytes),previousTemplateSha256:sha(oldTemplateBytes),
 priorCandidateBindingSha256:oldBinding.priorCandidateBindingSha256,browserIdentity:{path:CHROME_PATH,version:identity.version,sha256:NEW_CHROME_SHA,signature:'Valid',publisher:'Google LLC',
  previousVersion:'UNKNOWN_NOT_RECORDED',oldBinaryAvailable:false,preciseUpdateCause:'NOT_PROVEN',historicalChromeGuard:'EXACT_OLD_PATH_HASH_TO_VERIFIED_NEW_HASH_ONLY'},
 other2050BindingsUnchanged:true,independentGo:go,productionAuthorization:'NOT_AUTHORIZED',claimCreated:false,goIssued:false,productionRequests:0,productionWrites:0};
const bindingSha=write('EXECUTION_BINDING_GROUP1.json',binding);
const priorPending=JSON.parse(fs.readFileSync(path.join(oldArtifacts,'AUTHORIZATION_PENDING_NOT_AUTHORIZED.json')));
const pending={...priorPending,authorizationId:id,packetSha256:packetSha,executionBindingSha256:bindingSha};
assert.ok(Object.values(pending.humanGates).every(v=>v===null));assert.equal(pending.authorizedAtUTC,null);assert.equal(pending.authorizationExpiresUTC,null);
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json',pending);
let template=oldTemplateBytes.toString().replaceAll(oldPacket.authorizationId,id).replaceAll(oldBinding.independentGo,go)
 .replaceAll(sha(oldPacketBytes),packetSha).replaceAll(sha(oldBindingBytes),bindingSha)
 .replace('2051 implementation',binding.files.length+' implementation')
 .replaceAll(path.join(oldRoot,'entry.mjs'),path.join(newRoot,'entry.mjs'));
template+='\n## Exact Chrome Identity Rebinding (requires new full owner approval)\n\n'+
 'The v10 template/Packet/binding and all historical Claims/receipts remain unchanged. Only the inherited Chrome executable identity differs; other2050 inherited files, all budgets,14 mappings,16 RLS reads, exact reviewed assets, private input, source and Production targets are unchanged. A fresh ID/entry/Claim namespace and independent GO prevent confusion or replay.\n\n'+
 'Same executable path C:/Program Files/Google/Chrome/Application/chrome.exe, signed Google LLC, installed and actually launched version156.0.8078.12; exact SHA256 '+NEW_CHROME_SHA+'. The previous version was not recorded and no trusted old binary remains in the reviewed install directory; a specific updater event is NOT claimed proven. Existing OS updating is not disabled or configured. Preflight/child/frozen historical-review guards fail closed if these bytes change again.\n\n'+
 'The independent historical resource review retains every content/source/reference check and changes only its obsolete Chrome checksum comparison to the exact old path/hash -> verified new path/hash mapping. No other file, path, hash, network request or browser option receives an exception. Actual Chrome was observed using CDP process identity and Windows image-path verification, temporary separate profiles, unchanged deny proxy/launch flags/context restrictions. Six narrow local tests passed; no full14-case or Production replay.\n\n'+
 'All five gates and both UTC times remain NULL. Current local OAuth must be checked again before approving an actual UTC window and at GO; scopes account:read/workers_scripts:write and remaining strictly>1860s are unchanged. Budget650 is not a completion guarantee, USD0/Catalog/recovery limits remain. Approval alone is not GO.\n';
const templateSha=write('HUMAN_FULL_GROUP1_CHROME_AUTHORIZATION_NOT_AUTHORIZED.md',Buffer.from(template));
write('CHROME_REBIND_PREPARATION_SAFE.json',{status:'READY_FOR_OWNER_APPROVAL',authorizationId:id,other2050BindingsUnchanged:true,packetChangedFields:['authorizationId'],
 browserIdentityChanged:true,otherBudgetsUnchanged:true,executionBindingSha256:bindingSha,packetSha256:packetSha,templateSha256:templateSha,
 humanGates:'5_NULL',utcWindow:'NULL',claimCreated:false,goIssued:false,productionRequests:0,productionWrites:0});
console.log(JSON.stringify({status:'READY_FOR_OWNER_APPROVAL',authorizationId:id,executionBindingSha256:bindingSha,packetSha256:packetSha,templateSha256:templateSha,frozenFiles:binding.files.length,other2050BindingsUnchanged:true,humanGates:'5_NULL',utcWindow:'NULL',productionRequests:0,productionWrites:0}));
