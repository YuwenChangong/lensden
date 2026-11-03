import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {build,transform} from 'esbuild';
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from 'miniflare';
import {chromium} from 'playwright';
import {resolveR2WorkerRuntime} from '../lib/r2-worker-sdk-runtime.mjs';
import {createR2TicketRoute,validateR2CorsResponse} from './local-real-r2-cases.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const origin='https://127.0.0.1:4328';
let externalDispatches=0;

test('CORS preflight accepts 200/204 only with exact origin and required permissions',()=>{
  const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'PUT, GET, HEAD','access-control-allow-headers':'content-type, range'};
  for(const status of [200,204])assert.deepEqual(validateR2CorsResponse(new Response(null,{status,headers})),{originMatched:true,putAllowed:true,contentTypeAllowed:true});
  assert.throws(()=>validateR2CorsResponse(new Response(null,{status:403,headers})),/R2_CORS_PREFLIGHT_FAILED/);
  assert.throws(()=>validateR2CorsResponse(new Response(null,{status:204,headers:{...headers,'access-control-allow-origin':'*'}})),/R2_CORS_ORIGIN_MISMATCH/);
  assert.throws(()=>validateR2CorsResponse(new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET'}})),/R2_CORS_PUT_NOT_ALLOWED/);
  assert.throws(()=>validateR2CorsResponse(new Response(null,{status:204,headers:{...headers,'access-control-allow-headers':'range'}})),/R2_CORS_CONTENT_TYPE_NOT_ALLOWED/);
});

test('S3 runtime resolution is exact and does not alter other SDK or image modules',()=>{
  const importer=root.replaceAll('\\','/')+'/node_modules/@aws-sdk/client-s3/dist-es/S3Client.js';
  assert.ok(resolveR2WorkerRuntime('./runtimeConfig',importer).endsWith('/runtimeConfig.browser.js'));
  assert.ok(resolveR2WorkerRuntime('./runtimeConfig.js',importer).endsWith('/runtimeConfig.browser.js'));
  assert.equal(resolveR2WorkerRuntime('./runtimeConfig.shared',importer),null);
  assert.equal(resolveR2WorkerRuntime('./runtimeConfig',importer.replace('client-s3','client-sts')),null);
  assert.equal(resolveR2WorkerRuntime('./client-image',importer),null);
});

test('actual rebuilt Workerd signer produces a valid-shaped PUT ticket without network',async()=>{
  const files=await fs.readdir(path.join(root,'dist/server/chunks'));
  const chunk=files.find(n=>/^r2-server_.*\.mjs$/.test(n));assert.ok(chunk,'LOCAL_WORKER_BUILD_REQUIRED');
  const contents=`import {i as sign} from './dist/server/chunks/${chunk}';export default {async fetch(){try{const url=await sign({env:{R2_ACCOUNT_ID:'00000000000000000000000000000000',R2_ACCESS_KEY_ID:'offline-key',R2_SECRET_ACCESS_KEY:'offline-secret',R2_BUCKET_NAME:'offline-bucket'},objectKey:'tmp/offline.mp4',contentType:'video/mp4'});const u=new URL(url);return Response.json({ok:true,https:u.protocol==='https:',bucket:u.hostname.startsWith('offline-bucket.')||u.pathname.startsWith('/offline-bucket/'),path:u.pathname.endsWith('/tmp/offline.mp4'),algorithm:u.searchParams.get('X-Amz-Algorithm'),expires:u.searchParams.get('X-Amz-Expires'),signature:/^[a-f0-9]{64}$/.test(u.searchParams.get('X-Amz-Signature')||'')});}catch(e){return Response.json({ok:false,name:e.name,message:e.message});}}};`;
  const compiled=await build({stdin:{resolveDir:root,contents,sourcefile:'offline-signing.mjs'},bundle:true,write:false,format:'esm',platform:'neutral',packages:'external',external:['node:*']});
  const mf=new Miniflare(convertV4MiniflareOptions({log:new Log(LogLevel.NONE),telemetry:{enabled:false},workers:[{name:'offline-signing',modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-17',compatibilityFlags:['nodejs_compat'],outboundService:()=>{externalDispatches++;return new Response('OFFLINE_ONLY',{status:599});}}]}));
  try {
    const response=await mf.dispatchFetch('http://offline.local/');
    const d=await response.json();assert.equal(d.ok,true,'BUILT_WORKER_SIGNING_FAILED');
    assert.equal(d.https,true);assert.equal(d.bucket,true);assert.equal(d.path,true);
    assert.equal(d.algorithm,'AWS4-HMAC-SHA256');assert.equal(d.expires,'900');assert.equal(d.signature,true);
    assert.equal(externalDispatches,0);
  }finally{await mf.dispose();}
});

test('QA ticket interceptor preserves HTTP errors instead of fabricating fetch failures',async()=>{
  for(const status of [400,401,403,500]) {
    const r2={meta:{},register(){throw Error('UNEXPECTED_TICKET_REGISTRATION');}};
    let aborted=false,fulfilled=false,disposed=false;
    const response={status:()=>status,dispose:async()=>{disposed=true;}};
    await createR2TicketRoute(r2)({fetch:async()=>response,fulfill:async({response:r})=>{assert.equal(r,response);fulfilled=true;},abort:async()=>{aborted=true;}});
    assert.equal(fulfilled,true);assert.equal(aborted,false);assert.equal(disposed,true);
    assert.equal(r2.meta.ticket.httpStatus,status);assert.equal(r2.meta.ticket.stage,'HTTP_REJECTED');
  }
});

test('QA ticket interceptor validates successful tickets before releasing them',async()=>{
  let validated=false,fulfilled=false;
  const payload={post_id:'local'},data={upload_url:'synthetic-placeholder'};
  const r2={meta:{},register(d,p){assert.equal(d,data);assert.equal(p,payload);validated=true;}};
  const response={status:()=>200,json:async()=>data,dispose:async()=>{}};
  await createR2TicketRoute(r2)({request:()=>({postDataJSON:()=>payload}),fetch:async()=>response,fulfill:async()=>{assert.equal(validated,true);fulfilled=true;},abort:async()=>assert.fail('UNEXPECTED_ABORT')});
  assert.equal(fulfilled,true);assert.equal(r2.meta.ticket.stage,'COMPLETE');
});

test('invalid ticket target remains rejected before PUT',async()=>{
  let aborted=false;
  const r2={meta:{},register(){throw Error('R2_PRESIGNED_TARGET_MISMATCH');}};
  await createR2TicketRoute(r2)({request:()=>({postDataJSON:()=>({})}),fetch:async()=>({status:()=>200,json:async()=>({}),dispose:async()=>{}}),fulfill:async()=>assert.fail('UNSAFE_RELEASE'),abort:async()=>{aborted=true;}});
  assert.equal(aborted,true);assert.equal(r2.meta.ticket.errorClass,'R2_PRESIGNED_TARGET_MISMATCH');
});

test('real browser uses the source upload function: valid ticket PUT, HTTP rejection, permitted transport fallback',async()=>{
  const source=await fs.readFile(path.join(root,'src/components/forum/CreatePostForm.tsx'),'utf8');
  const ast=ts.createSourceFile('CreatePostForm.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let fn,fallback;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='uploadVideoToExternal')fn=n.getText(ast);if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='canFallbackToSupabase')fallback=n.initializer.getText(ast);ts.forEachChild(n,visit);}
  visit(ast);assert.ok(fn&&fallback);
  const code=(await transform(fn+'\nglobalThis.sourceVideoUpload=uploadVideoToExternal;globalThis.sourceFallbackAllowed=(uploadMessage)=>('+fallback+');',{loader:'ts'})).code;
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
  const context=await browser.newContext({serviceWorkers:'block'});
  let mode='valid',puts=0,posts=0;
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin&&u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline fixture</title>'});
    if(u.origin===origin&&u.pathname==='/api/forum/external-video-upload') {
      posts++;
      if(mode==='transport')return route.abort();
      return route.fulfill({status:mode==='valid'?200:500,contentType:'application/json',body:JSON.stringify(mode==='valid'?{upload_url:origin+'/mock-presigned-put',media_url:origin+'/mock-media',storage_path:'tmp/offline.mp4'}:{error:'EXTERNAL_VIDEO_UPLOAD_FAILED'})});
    }
    if(u.origin===origin&&u.pathname==='/mock-presigned-put'&&route.request().method()==='PUT') {
      puts++;assert.equal(route.request().headers()['content-type'],'video/mp4');assert.equal(route.request().postDataBuffer().length,2028);
      return route.fulfill({status:200,body:''});
    }
    return route.abort();
  });
  try {
    const p=await context.newPage();await p.goto(origin);await p.addScriptTag({content:code});
    const invoke=()=>p.evaluate(async()=>{try{const r=await sourceVideoUpload({accessToken:'offline-synthetic-token',postId:'offline-post',file:new File([new Uint8Array(2028)],'offline.mp4',{type:'video/mp4'})});return {ok:true,path:r.storagePath};}catch(e){return {ok:false,fallback:sourceFallbackAllowed(e.message),knownServerError:e.message==='EXTERNAL_VIDEO_UPLOAD_FAILED'};}});
    assert.deepEqual(await invoke(),{ok:true,path:'tmp/offline.mp4'});assert.equal(puts,1);
    mode='http';assert.deepEqual(await invoke(),{ok:false,fallback:false,knownServerError:true});assert.equal(puts,1);
    mode='transport';const error=await invoke();assert.equal(error.ok,false);assert.equal(error.fallback,true);assert.equal(puts,1);assert.equal(posts,3);
  }finally{await context.close();await browser.close();}
});

test('unchanged image and thumbnail optimizer still runs in real Chrome',async()=>{
  const source=await fs.readFile(path.join(root,'src/lib/client-image.ts'),'utf8');
  const code=(await transform(source,{loader:'ts',format:'iife',globalName:'ImageFixture'})).code;
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
  const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>r.abort());
  try {
    const p=await context.newPage();await p.addScriptTag({content:code});
    const results=await p.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;canvas.getContext('2d').fillRect(0,0,64,48);
      const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const file=new File([blob],'offline-image.png',{type:'image/png'});
      const out=[];for(const maxWidth of [64,32]){const r=await ImageFixture.createOptimizedImageVariant(file,{maxWidth,quality:.8,fileName:'offline-image'});out.push({width:r.width,height:r.height,bytes:r.file.size,mime:r.file.type});}return out;
    });
    assert.deepEqual(results.map(r=>r.width),[64,32]);
    assert.ok(results[0].bytes>0&&['image/png','image/webp'].includes(results[0].mime));
    assert.ok(results[1].bytes>0&&results[1].mime==='image/webp');
  }finally{await context.close();await browser.close();}
});
