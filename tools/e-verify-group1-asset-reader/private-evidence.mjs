import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {sha256} from './hash.mjs';
const script=fileURLToPath(new URL('./protect-evidence.ps1',import.meta.url));
const ps='C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
export function protectedOperation(operation,id,{directory,input}={}){
  if(process.platform!=='win32'||!/^e-verify-group1-[a-z0-9-]{1,160}$/.test(id))throw new Error('PROTECTED_CAPTURE_UNAVAILABLE');
  const args=['-NoProfile','-NonInteractive','-File',script,'-Operation',operation,'-AuthorizationId',id];
  if(directory)args.push('-Directory',directory);
  const r=spawnSync(ps,args,{input:input?.toString('base64'),encoding:'utf8',timeout:5000,maxBuffer:3000000,windowsHide:true,
    env:{SystemRoot:process.env.SystemRoot,LOCALAPPDATA:process.env.LOCALAPPDATA,APPDATA:process.env.APPDATA,USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,TMP:process.env.TMP}});
  if(r.status!==0||r.signal||r.error)throw new Error('PROTECTED_CAPTURE_FAILED');return r.stdout.trim();
}
export function probeProtectedCapture(id){if(protectedOperation('Probe',id)!=='PROTECTED_CAPTURE_READY')throw new Error('PROTECTED_CAPTURE_FAILED');return true}
export function createPrivateCapture(directory,id){
  if(protectedOperation('Initialize',id,{directory})!=='PRIVATE_EVIDENCE_READY')throw new Error('PROTECTED_CAPTURE_FAILED');
  const used=new Set();
  return async(ref,body)=>{
    if(!/^(?:login-html|asset-[a-f0-9]{32})$/.test(ref)||used.has(ref)||!Buffer.isBuffer(body)||body.length>2097152)throw new Error('CAPTURE_SCOPE');
    used.add(ref);const encoded=protectedOperation('Protect',id,{input:body});
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('PROTECTED_CAPTURE_FAILED');
    const cipher=Buffer.from(encoded,'base64');
    fs.writeFileSync(path.join(directory,ref+'.dpapi'),cipher,{flag:'wx'});
    return {encrypted:true,ciphertextSha256:sha256(cipher),evidenceRef:ref};
  };
}
// Offline review only: caller keeps returned bytes private, never tool/log output.
export function readProtectedEvidence(directory,id,ref,expectedCipherSha256){
  if(!/^(?:login-html|asset-[a-f0-9]{32})$/.test(ref)||!/^[a-f0-9]{64}$/.test(expectedCipherSha256))throw new Error('CAPTURE_SCOPE');
  const cipher=fs.readFileSync(path.join(directory,ref+'.dpapi'));
  if(sha256(cipher)!==expectedCipherSha256)throw new Error('PRIVATE_ARTIFACT_HASH');
  return Buffer.from(protectedOperation('Unprotect',id,{input:cipher}),'base64');
}
