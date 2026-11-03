import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewV9} from './review.mjs';

test('nine v9 captures, six source counterparts and the reused23 literal graph verify',async()=>{
  const r=await reviewV9();
  assert.equal(r.safe.v9ProtectedFiles,9);
  assert.equal(r.safe.newAssets.length,6);
  assert.equal(r.safe.assets.length,29);
  assert.equal(r.safe.literalGraph,'CLOSED');
  assert.equal(r.safe.productDetailInline,'EXACT_FROZEN_COMPILED_BYTES');
  assert.ok(r.safe.newAssets.every(a=>a.provenance==='VERIFIED'));
  assert.equal(r.safe.productionRequests,0);
});
