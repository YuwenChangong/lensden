import fs from'node:fs';import os from'node:os';import path from'node:path';
function validate(p){
 const root=fs.realpathSync(os.tmpdir());
 if(typeof p!=='string'||!path.isAbsolute(p)||path.dirname(p)!==root||!/^ogh-native-qa-[a-zA-Z0-9]+$/.test(path.basename(p)))throw new Error('PROFILE_PATH_OUTSIDE_OWNED_TEMP');
 if(fs.existsSync(p)&&(fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p))throw new Error('PROFILE_REPARSE_FORBIDDEN');
 return p;
}
export function createProfile(){return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'ogh-native-qa-'))}
export function assertNewProfile(p){validate(p);if(!fs.existsSync(p)||fs.readdirSync(p).length)throw new Error('PROFILE_NOT_EMPTY');return p}
export function cleanupProfile(p){validate(p);if(fs.existsSync(p))fs.rmSync(p,{recursive:true,maxRetries:0});return!fs.existsSync(p)}
