import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const require=createRequire(import.meta.url);
const frozen='C:/Temp/ogh-admin-mfa-activation-20261024/enforcement/client/_astro/AdminSecurityPanel.w4PMPLet.js';
assert.equal(createHash('sha256').update(await fs.readFile(frozen)).digest('hex'),'525c1c009958a80568cd516380403ee3a3b939fb3b2c0a27e1051845a90ae380');
const observer=fileURLToPath(new URL('./mfa-stepup-observation.mjs',import.meta.url));
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Panel from ${JSON.stringify(frozen)};import{installMfaStepupObservation}from ${JSON.stringify(observer)};
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const f=window.__fixture={counts:{challenge:0,verify:0},state:{status:'ready',me:{user_id:'33333333-3333-4333-8333-333333333333',role:'moderator'}}};
f.client={auth:{getSession:async()=>({error:null,data:{session:{user:{id:f.state.me.user_id},access_token:'NONSECRET_OFFLINE_FIXTURE_ONLY'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),mfa:{listFactors:async()=>({error:null,data:{all:ids.map(id=>({id,status:'verified',factor_type:'totp'}))}}),challenge:()=>{f.counts.challenge++;return new Promise(resolve=>f.finishChallenge=error=>resolve({error,data:error?null:{id:'OFFLINE_CHALLENGE'}}));},verify:()=>{f.counts.verify++;return new Promise(resolve=>f.finishVerify=error=>resolve({error,data:null}));}}}};
f.install=()=>f.observer=installMfaStepupObservation([...document.querySelectorAll('form')].find(form=>form.querySelector('button')?.textContent==='Verify session'),f.client.auth);
createRoot(document.getElementById('root')).render(React.createElement(Panel));`;
const paths={react:require.resolve('react'),jsx:require.resolve('react/jsx-runtime')};
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'offline-fixed-auth-boundary',setup(b){
 b.onResolve({filter:/\/(?:react\.DZuxrRTg|jsx-runtime\.0ERSmlRc|useAdminSession\.BPWON9J5)\.js$/},args=>({path:args.path,namespace:'offline-dependency'}));
 b.onLoad({filter:/.*/,namespace:'offline-dependency'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path.includes('useAdminSession')?`export function t(){return {state:window.__fixture.state,supabase:window.__fixture.client}};export async function r(path){return path==='/api/admin/mfa'?{aal:'aal2'}:{...window.__fixture.state.me,allowed:true}}`:args.path.includes('jsx-runtime')?`import * as jsx from ${JSON.stringify(paths.jsx)};export const t=()=>jsx;`:`import React from ${JSON.stringify(paths.react)};export const t=()=>React;export const r=mod=>mod;`}));
}}]});
let requests=0,browser,context,passed=0;
try{
 browser=await chromium.launch({headless:true,args:['--disable-background-networking']});
 context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',route=>{requests++;return route.abort();});
 const page=await context.newPage();
 const start=async()=>{await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('option',{name:/verified/}).first().waitFor({state:'attached'});await page.evaluate(()=>window.__fixture.install());};
 const snapshot=()=>page.evaluate(()=>window.__fixture.observer.snapshot());
 const stop=()=>page.evaluate(()=>window.__fixture.observer.detach());
 const valid=async()=>{await page.getByLabel('Saved authenticators').selectOption('11111111-1111-4111-8111-111111111111');await page.getByLabel('Authenticator code',{exact:true}).fill('123456');};
 const waitCalls=(key,n)=>page.waitForFunction(([k,n])=>window.__fixture.counts[k]===n,[key,n]);
 await start();
 assert.equal((await snapshot()).formState.verifyButtonDisabled,true);
 await valid();await page.getByLabel('Authenticator code',{exact:true}).fill('123');
 assert.equal((await snapshot()).formState.verifyButtonDisabled,true);assert.equal((await snapshot()).formState.codeValid,false);
 // Fixture-only DOM mutation demonstrates browser validity preventing submit.
 await page.getByRole('button',{name:'Verify session',exact:true}).evaluate(b=>b.disabled=false);
 await page.getByRole('button',{name:'Verify session',exact:true}).click();
 let s=await snapshot();assert.equal(s.uiEvents.invalidCodeObserved,true);assert.equal(s.submitEvent,'UNKNOWN');assert.equal(s.challenge.invocations,0);await stop();passed++;

 await start();await valid();await page.getByRole('button',{name:'Verify session',exact:true}).click();await waitCalls('challenge',1);
 assert.equal((await snapshot()).observedStep,'CHALLENGE_STARTED');
 await page.evaluate(()=>window.__fixture.finishChallenge({code:'mfa_verification_failed',status:400}));
 await page.waitForFunction(()=>window.__fixture.observer.snapshot().observedStep==='CHALLENGE_FAILED');await stop();passed++;

 await start();await valid();await page.getByRole('button',{name:'Verify session',exact:true}).click();await waitCalls('challenge',1);
 await page.evaluate(()=>window.__fixture.finishChallenge(null));await waitCalls('verify',1);assert.equal((await snapshot()).observedStep,'VERIFY_STARTED');
 await page.evaluate(()=>window.__fixture.finishVerify({code:'mfa_verification_failed',status:400}));
 await page.waitForFunction(()=>window.__fixture.observer.snapshot().observedStep==='VERIFY_FAILED');await stop();passed++;

 await start();await valid();await page.getByRole('button',{name:'Verify session',exact:true}).click();await waitCalls('challenge',1);
 await page.evaluate(()=>window.__fixture.finishChallenge(null));await waitCalls('verify',1);await page.evaluate(()=>window.__fixture.finishVerify(null));
 await page.waitForFunction(()=>window.__fixture.observer.snapshot().observedStep==='VERIFIED');s=await snapshot();assert.equal(s.workerAal,'UNKNOWN');assert.equal(s.submitEvent,'TRUSTED_OBSERVED');await stop();passed++;

 await start();await page.evaluate(()=>document.querySelectorAll('form')[0].remove());s=await snapshot();assert.equal(s.blocked,'MFA_OBSERVATION_FORM_DETACHED');assert.equal(s.cleanup,'PASS');passed++;
 assert.equal(requests,0);console.log(JSON.stringify({task:'FROZEN_FORM_OFFLINE_BOUNDARIES',passed,failed:0,externalPageRequests:requests,realCredentialReads:0,productionOperations:0}));
}finally{await context?.close();await browser?.close();}
