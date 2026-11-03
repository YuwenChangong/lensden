import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const source=fileURLToPath(new URL('../e-verify-group1-v9-closure/full-flow-fixture.mjs',import.meta.url));
const binding=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../e-verify-group1-full650/artifacts/EXECUTION_BINDING_GROUP1.json',import.meta.url))));
const bound=binding.files.find(f=>path.resolve(f.path)===path.resolve(source));
let text=fs.readFileSync(source,'utf8');if(!bound||sha(Buffer.from(text))!==bound.sha256)throw new Error('FIXTURE_SOURCE_DRIFT');
const edits=[
 ["import {reviewV9,ORIGIN,VERSION} from './review.mjs';","import {reviewV9,ORIGIN,VERSION} from './review-rebound.mjs';"],
 ["import {makeBrowserFactory,runBoundGroup1} from './adapter.mjs';","import {makeBrowserFactory} from '../e-verify-group1-v9-closure/adapter.mjs';\nimport {runChromeSubset as runBoundGroup1} from './subset-runner.mjs';"],
 ["STATEFUL_PRIVATE_BINDING_WORKING.json","STATEFUL_PRIVATE_BINDING_GROUP1_650_V1.json"],
 ["C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json",fileURLToPath(new URL('../e-verify-group1-full650/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json',import.meta.url)).replaceAll('\\','/')],
];
for(const [old,next] of edits){if(text.split(old).length!==2)throw new Error('FIXTURE_PATCH_NOT_EXACT');text=text.replace(old,next)}
fs.writeFileSync(path.join(here,'fixture-rebound.mjs'),text,{flag:'wx'});
const reviewSource=fileURLToPath(new URL('../e-verify-group1-v9-closure/review.mjs',import.meta.url));
const reviewedFile=binding.files.find(f=>path.resolve(f.path)===path.resolve(reviewSource));
let reviewed=fs.readFileSync(reviewSource,'utf8');if(!reviewedFile||sha(Buffer.from(reviewed))!==reviewedFile.sha256)throw new Error('REVIEW_SOURCE_DRIFT');
const loop="for(const f of b.files)requireThat(sha(fs.readFileSync(f.path))===f.sha256,'V9_FROZEN_FILE_DRIFT');";
if(reviewed.split(loop).length!==2)throw new Error('REVIEW_PATCH_NOT_EXACT');
reviewed=reviewed.replace("from './semantic.mjs'","from '../e-verify-group1-v9-closure/semantic.mjs'").replace(loop,"verifyHistoricalFiles(b.files,'V9_FROZEN_FILE_DRIFT');");
reviewed="import {verifyHistoricalFiles} from './chrome-identity.mjs';\n"+reviewed;
fs.writeFileSync(path.join(here,'review-rebound.mjs'),reviewed,{flag:'wx'});
console.log(JSON.stringify({status:'PASS',sourceSha256:bound.sha256,changes:edits.length,flow:'NARROW_CHROME_SUBSET_NO_RLS',productionRequests:0}));
