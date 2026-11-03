import fs from 'node:fs';import path from 'node:path';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
export const CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe';
export const OLD_CHROME_SHA='d3784ffbf1f6109348416064b3e4cd739b06fa61d89a81b262c780df9f32270c';
export const NEW_CHROME_SHA='5db678875eb6895c802240aab8e9003aaee63124f719697d88077c46a7ed9f2a';
const isChrome=p=>path.resolve(p).toLowerCase()===path.resolve(CHROME_PATH).toLowerCase();
export function verifyHistoricalFiles(files,code='HISTORICAL_INPUT_DRIFT'){
 let changed=0;
 for(const f of files){const actual=sha(fs.readFileSync(f.path));if(isChrome(f.path)){
   if(f.sha256!==OLD_CHROME_SHA||actual!==NEW_CHROME_SHA)throw new Error(code);changed++;
  }else if(actual!==f.sha256)throw new Error(code)}
 if(changed!==1)throw new Error('HISTORICAL_CHROME_BINDING_NOT_EXACT');
 return {changedChromeEntries:changed,otherFilesUnchanged:true};
}
