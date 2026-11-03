import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {readProtectedEvidence} from '../e-verify-group1-asset-reader-fresh-v8/private-evidence.mjs';
import {sha256} from './hash.mjs';
const root=fileURLToPath(new URL('../e-verify-group1-asset-reader-fresh-v8/artifacts/',import.meta.url));
export function loadReuse(){
 const binding=JSON.parse(fs.readFileSync(root+'EXECUTION_BINDING_ASSET_READER.json'));
 const receiptBytes=fs.readFileSync(root+'ASSET_READ_EXECUTION_SAFE.json'),receipt=JSON.parse(receiptBytes);
 const closure=JSON.parse(fs.readFileSync(root+'ASSET_READ_GO_CLOSURE_SAFE.json'));
 const review=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-production-binding/artifacts/PRODUCTION_RESOURCE_REVIEW_SAFE.json',import.meta.url)));
 if(closure.childReceiptSha256!==sha256(receiptBytes)||review.receiptSha256!==sha256(receiptBytes)||review.assets.length!==23
  ||closure.status!=='CONTENT_EVIDENCE_COLLECTED'||review.version!=='b2b62ec9-bb8d-4159-ac99-08fca5740134')throw new Error('REUSE_CHAIN_INVALID');
 const read=row=>{const body=readProtectedEvidence(binding.privateEvidenceDirectory,binding.authorizationId,row.evidence.evidenceRef,row.evidence.ciphertextSha256);
  if(body.length!==row.bytes||sha256(body)!==row.sha256)throw new Error('REUSED_CONTENT_CHANGED');return body};
 return {html:read(receipt.html),assets:receipt.assets.map(a=>{
  const p=review.assets.find(x=>x.path===a.path);
  if(!p||p.provenance!=='VERIFIED'||p.sha256!==a.sha256||p.bytes!==a.bytes)throw new Error('REUSE_REVIEW_MISMATCH');
  return {path:a.path,kind:a.kind,bytes:a.bytes,sha256:a.sha256,body:read(a)};
 })};
}
