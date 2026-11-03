import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readProtectedEvidence} from '../e-verify-group1-remaining-assets/private-evidence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(ok,code)=>{if(!ok)throw new Error(code)};
const old=fileURLToPath(new URL('../e-verify-group1-full650-chrome-v11/artifacts/',import.meta.url));

// Reuse the completed provenance review. Only authenticate the exact inputs being read.
export function loadRetainedInputs(){
 const pb=fs.readFileSync(path.join(old,'GROUP1_PACKET_NOT_AUTHORIZED.json'));
 check(sha(pb)==='a6a356005f43b92dc16625ec3109324a08c6d8dd8fa2b88eca23333ef3a54ed8','RETAINED_PACKET_DRIFT');
 const packet=JSON.parse(pb),binding=JSON.parse(fs.readFileSync(path.join(old,'EXECUTION_BINDING_GROUP1.json')));
 const historicalV9Binding=fileURLToPath(new URL('../e-verify-group1-remaining-assets/artifacts/EXECUTION_BINDING_ASSET_READER.json',import.meta.url));
 const readPinned=file=>{const expected=binding.files.find(f=>path.resolve(f.path).toLowerCase()===path.resolve(file).toLowerCase());
  const expectedHash=expected?.sha256||(path.resolve(file)===path.resolve(historicalV9Binding)?'29bb114ac2fc74d8509d2178658c5ad8afe50a420ff15d9a13c133c7b4e104bd':null);
  const bytes=fs.readFileSync(file);check(expectedHash&&sha(bytes)===expectedHash,'RETAINED_METADATA_DRIFT');return JSON.parse(bytes)};
 const inputs=[['../e-verify-group1-asset-reader-fresh-v8/artifacts/',false],['../e-verify-group1-remaining-assets/artifacts/',true]];
 const bodies=new Map();let html;
 for(const [relative,v9]of inputs){
  const root=fileURLToPath(new URL(relative,import.meta.url)),meta=readPinned(root+'EXECUTION_BINDING_ASSET_READER.json'),receipt=readPinned(root+'ASSET_READ_EXECUTION_SAFE.json');
  check(receipt.sourceCommit===packet.sourceSha&&receipt.status==='CONTENT_EVIDENCE_COLLECTED','RETAINED_SOURCE_LINK');
  const read=row=>{const bytes=readProtectedEvidence(meta.privateEvidenceDirectory,meta.authorizationId,row.evidence.evidenceRef,row.evidence.ciphertextSha256);
   check(bytes.length===row.bytes&&sha(bytes)===row.sha256,'RETAINED_BYTES_DRIFT');return bytes};
  if(!v9){html=read(receipt.html);for(const row of receipt.assets)bodies.set(row.path,read(row))}
  else for(const row of receipt.newAssets)bodies.set(row.path,read(row));
 }
 check(html&&sha(html)==='3d47e816eb1605fa98c203b62372528170d9dc356866ff1a6e61d670ab49468c','RETAINED_LOGIN_HTML');
 check(bodies.size===29&&packet.staticManifest.every(a=>bodies.has(a.path)&&sha(bodies.get(a.path))===a.sha256),'RETAINED_REVIEWED_RESOURCE_SET');
 return {packet,html,bodies};
}
