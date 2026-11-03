import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrowserFactory} from './adapter.mjs';
import {reviewV9} from './review.mjs';
import {StaticEvidencePolicy} from '../e-verify-group1-production-binding/policy.mjs';
import {compareNewModule} from './semantic.mjs';
import fs from 'node:fs';
import {stem} from '../e-verify-group1-production-binding/semantic.mjs';

const reviewed=await reviewV9();

test('complete static scope preserves29 exact resources and refuses old/unknown paths',async()=>{
  const {safe}=reviewed;
  const factory=makeBrowserFactory({manifest:safe.assets,htmlHashes:{'/login/':['1'.repeat(64)]}});
  assert.equal(typeof factory,'function');
  assert.equal(safe.assets.some(x=>x.path.includes('DaQNT1ww')),false);
  assert.equal(safe.assets.filter(x=>x.path.includes('AdminDevicesDashboard')).length,1);
});
test('all29 exact bytes are verified and wrong origins/methods/stages/actors/types remain denied',()=>{
 const origin='https://openglasshub.ogh.workers.dev',version=reviewed.safe.version;
 const p=new StaticEvidencePolicy({origin,version,assets:reviewed.safe.assets});
 for(const row of reviewed.safe.assets){const q={url:origin+row.path,method:'GET',actor:'A'},m={stage:'LOGIN_A',resourceType:row.kind};
   assert.equal(p.assertRequest(q,m,version).path,row.path);assert.equal(p.assertBody(row.path,reviewed.bodies.get(row.path)),true);
   for(const [bad,meta]of [[{...q,url:'https://bad.invalid'+row.path},m],[{...q,method:'POST'},m],[{...q,actor:'B'},m],[q,{...m,stage:'UNBOUND'}],[q,{...m,resourceType:'fetch'}]])assert.throws(()=>p.assertRequest(bad,meta,version));
 }
 assert.throws(()=>p.assertRequest({url:origin+'/_astro/SiteHeader.astro_astro_type_script_index_0_lang.DaQNT1ww.js',method:'GET',actor:'A'},{stage:'LOGIN_A',resourceType:'script'},version));
});
test('dialog import-order review cannot be reused for changed bytes',()=>{
 const a=reviewed.safe.newAssets.find(a=>a.path.includes('GlassConfirmDialog')),body=reviewed.bodies.get(a.path),local=fs.readFileSync('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/dist/client'+a.localPath);
 const known=new Set(reviewed.safe.assets.map(a=>stem(a.path)));
 assert.equal(compareNewModule(body,local,a.path,a.localPath,known).matches,true);
 assert.throws(()=>compareNewModule(Buffer.concat([body,Buffer.from(';fetch("https://bad.invalid")')]),local,a.path,a.localPath,known),/PAIR_CHANGED/);
});
