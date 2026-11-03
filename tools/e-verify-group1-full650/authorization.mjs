import fs from 'node:fs';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
import {HUMAN_GATES,validateAuthorization as validate} from '../e-verify-group1-remaining-assets/authorization.mjs';
import {GO as ORIGINAL_GO} from '../e-verify-group1-remaining-assets/authorization.mjs';
export {HUMAN_GATES};
export const ID='e-verify-group1-openglasshub-20261014-full650-v10';
export const GO='GO_E_VERIFY_GROUP1_FULL650_V10';
export function validateAuthorization(auth,options){
 if(options.go!==GO||auth?.authorizationId!==ID||options.packet?.authorizationId!==ID)throw new Error('GROUP1_AUTHORIZATION_INVALID');
 return validate(auth,{...options,go:ORIGINAL_GO});
}
export function verifyFiles(files){for(const f of files){if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('FROZEN_FILE_DRIFT')}return true}
export function claimOnce(file,id){if(id!==ID)throw new Error('CLAIM_ID_MISMATCH');const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,id+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
