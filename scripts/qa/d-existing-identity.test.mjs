import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {identityCode} from './d-execution-runtime.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const circleId = '22222222-2222-4222-8222-222222222222';
const fixture = {controlledAlias:'synthetic@example.invalid', namespace:'synthetic',
  existingCircleId:circleId, existingCircleSlug:'synthetic-video'};
async function run({mode='OWNER_EXISTING', role='user', appRole='user', mismatch=false, expiry=Date.now()/1000+3600}={}) {
  const calls=[];
  const session={user:{id,email:fixture.controlledAlias},access_token:'synthetic-only',expires_at:expiry};
  const user={id:mismatch?circleId:id,email:fixture.controlledAlias,email_confirmed_at:'2026-01-01T00:00:00Z',
    created_at:'2026-01-01T00:00:00Z',role:'authenticated',app_metadata:{role:appRole},user_metadata:{}};
  const client={supabaseKey:'synthetic-only',auth:{storage:{getItem:async()=>JSON.stringify(session)}}};
  const window={};window.top=window;
  const code=identityCode({actorMode:mode,actorId:id,deadlineUtc:new Date(Date.now()+60000).toISOString()},fixture)
    .replace("(await import('/_astro/supabase-browser.CbJzQpCJ.js')).n()",'client');
  const execute=vm.runInNewContext('('+code+')',{client,window,location:{origin:'https://openglasshub.ogh.workers.dev',search:'',hash:''},
    TextDecoder,AbortSignal,fetch:async url=>{calls.push(url);let value;
      if(url.endsWith('/auth/v1/user'))value=user;
      else if(url.includes('/profiles?'))value=[{id,role}];
      else if(url.includes('/circles?'))value=[{id:circleId,slug:fixture.existingCircleSlug,name:'Synthetic video',status:'active'}];
      else throw Error('UNEXPECTED_REQUEST');
      return new Response(JSON.stringify(value),{status:200});}});
  return {result:await execute(),calls};
}
test('existing ordinary identity is verified without claiming this-run creation',async()=>{
  const {result,calls}=await run();assert.equal(result.actorId,id);assert.equal(result.createdByThisRun,false);
  assert.equal(result.actorMode,'OWNER_EXISTING');assert.equal(calls.length,3);
  assert.equal(JSON.stringify(result).includes('synthetic-only'),false);
});
test('existing Moderator profile is rejected',async()=>{await assert.rejects(run({role:'moderator'}));});
test('existing elevated Auth metadata is rejected',async()=>{await assert.rejects(run({appRole:'admin'}));});
test('mismatched authenticated identity is rejected',async()=>{await assert.rejects(run({mismatch:true}));});
test('missing expiry fails before requests',async()=>{await assert.rejects(run({expiry:null}));});
test('original new-fixture namespace requirement is preserved',async()=>{await assert.rejects(run({mode:'NEW_FIXTURE'}));});
