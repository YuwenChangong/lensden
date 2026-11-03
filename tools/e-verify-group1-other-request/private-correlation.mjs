import fs from 'node:fs';import path from 'node:path';import {generateKeyPairSync,randomBytes,publicEncrypt,privateDecrypt,createCipheriv,createDecipheriv,createHash,constants} from 'node:crypto';
import {protectedOperation} from '../e-verify-group1-remaining-assets/private-evidence.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=()=>path.join(process.env.LOCALAPPDATA,'OpenGlassHub','acceptance-evidence','other-request');
function scope(directory,id){if(!/^e-verify-group1-[a-z0-9-]{1,160}$/.test(id)||path.dirname(path.resolve(directory)).toLowerCase()!==path.resolve(base()).toLowerCase()||path.basename(directory)!==id)throw new Error('PRIVATE_CORRELATION_SCOPE')}
// Prepare before the existing Node guard; runtime capture uses only crypto + local FS.
export function createPrivateCorrelation(directory,id){
 scope(directory,id);if(protectedOperation('Initialize',id,{directory})!=='PRIVATE_EVIDENCE_READY')throw new Error('PRIVATE_CORRELATION_INIT');
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),plain=keys.privateKey.export({type:'pkcs8',format:'pem'});
 const secret=Buffer.from(plain);const encrypted=protectedOperation('Protect',id,{input:secret});secret.fill(0);
 fs.writeFileSync(path.join(directory,'private-key.dpapi'),Buffer.from(encrypted,'base64'),{flag:'wx'});let used=false;
 return Object.freeze({capture(request,d){
  let u;try{u=new URL(request.url)}catch{return{status:'PRIVACY_BLOCKED'}}
  if(used)return{status:'CAPTURE_LIMIT_REACHED'};
  if(request.method!=='GET'||request.actor!=='A'||d.actor!=='A'||u.protocol!=='https:'||u.origin!=='https://openglasshub.ogh.workers.dev'||d.originClass!=='APPLICATION'||d.protocolClass!=='HTTPS'||d.stage!=='LOGIN_A'||d.resourceType!=='other'||u.username||u.password||u.pathname.length>4096||/token|session|password|secret|@|%40|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i.test(u.pathname)||!/^([a-f0-9]{64})$/.test(d.evidenceId))return{status:'PRIVACY_BLOCKED'};
  // Never preserve URL query/fragment, credentials, headers, body, Frame URL or Session.
  const body=Buffer.from(JSON.stringify({stage:d.stage,actor:d.actor,originClass:d.originClass,pathname:u.pathname}));
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),payload=Buffer.concat([cipher.update(body),cipher.final()]);body.fill(0);
  const wrapped=publicEncrypt({key:keys.publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key);key.fill(0);
  const encoded=Buffer.from(JSON.stringify({format:'ogh-private-path-correlation-v1',wrapped:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),payload:payload.toString('base64')}));
  const ref='request-'+d.evidenceId;fs.writeFileSync(path.join(directory,ref+'.sealed.json'),encoded,{flag:'wx'});used=true;
  return{status:'ENCRYPTED_PATH_ONLY',evidenceRef:ref,ciphertextSha256:hash(encoded)};
 }});
}
export function readPrivateCorrelation(directory,id,ref,expectedHash){
 scope(directory,id);if(!/^request-[a-f0-9]{64}$/.test(ref)||!/^[a-f0-9]{64}$/.test(expectedHash))throw new Error('PRIVATE_CORRELATION_REF');
 const bytes=fs.readFileSync(path.join(directory,ref+'.sealed.json'));if(bytes.length>16384||hash(bytes)!==expectedHash)throw new Error('PRIVATE_CORRELATION_HASH');
 const e=JSON.parse(bytes);if(e.format!=='ogh-private-path-correlation-v1')throw new Error('PRIVATE_CORRELATION_FORMAT');
 const protectedKey=fs.readFileSync(path.join(directory,'private-key.dpapi')),privateKey=Buffer.from(protectedOperation('Unprotect',id,{input:protectedKey}),'base64');
 const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(e.wrapped,'base64'));privateKey.fill(0);
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));decipher.setAuthTag(Buffer.from(e.tag,'base64'));
 const plain=Buffer.concat([decipher.update(Buffer.from(e.payload,'base64')),decipher.final()]);key.fill(0);try{return JSON.parse(plain)}finally{plain.fill(0)};
}
