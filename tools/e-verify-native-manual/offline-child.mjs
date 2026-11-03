import http from'node:http';import fs from'node:fs';
import {waitForStart}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {runNative}from'./native-browser.mjs';
await waitForStart();const mode=process.argv[2],file=process.argv[3];let sdkHits=0,frameHits=0,forbiddenHits=0;
const fatal=e=>{const modules=['native-browser.mjs','profile.mjs','offline-child.mjs','scope.mjs','evidence.mjs'];
 const frames=String(e?.stack||'').split('\n').slice(1).map(line=>{const name=modules.find(n=>line.includes(n));const position=line.match(/:(\d+):(\d+)\)?$/);return name&&position?{module:name,line:Number(position[1])}:null}).filter(Boolean);
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({fixtureOnly:true,fatalCode:/^[A-Z0-9_]+$/.test(e?.code)?e.code:'UNHANDLED_FIXTURE_ERROR',fatalFrames:frames}),{flag:'wx'});process.exit(1)};
process.on('unhandledRejection',fatal);process.on('uncaughtException',fatal);
const forbidden=http.createServer((_,r)=>{forbiddenHits++;r.end('FORBIDDEN')});await new Promise(r=>forbidden.listen(0,'127.0.0.1',r));
let vendor;
const fixture=http.createServer((q,r)=>{
 if(q.url==='/fixture/sdk.js'){sdkHits++;if(mode==='redirect'){r.writeHead(302,{location:'/fixture/sdk-native.js'});r.end();return}}
 if(['/fixture/sdk.js','/fixture/sdk-native.js'].includes(q.url)){
  r.setHeader('content-type','application/javascript');r.end(`window.turnstile={render:(s,o)=>{${mode==='unknown'?`fetch('http://127.0.0.1:${forbidden.address().port}/PRIVATE_TOKEN');`:''}
  const f=document.createElement('iframe');f.src='${vendor}/fixture/frame';f.onload=()=>o.callback('DISCARDED_FAKE_TOKEN');document.querySelector(s).append(f);return'fixture'}}`);
 }else if(q.url==='/fixture/frame'){frameHits++;r.setHeader('content-type','text/html');r.end('<p>Mock widget</p>')}
 else{r.writeHead(404);r.end()}
});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));vendor='http://127.0.0.1:'+fixture.address().port;
const proxy=http.createServer((_,r)=>{r.writeHead(403);r.end()});proxy.on('connect',(_,s)=>{
 s.on('error',()=>{});s.end('HTTP/1.1 403 Forbidden\r\n\r\n');
 if(mode==='proxy-error')setImmediate(()=>s.emit('error',new Error('OFFLINE_FIXTURE_SOCKET_CLOSE')));
});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
let result;try{result=await runNative({fixtureOrigin:vendor,offlineProxy:'http://127.0.0.1:'+proxy.address().port,workMs:mode==='wait'?2500:10000,
 fixtureOwner:async p=>{await p.locator('#start').click();if(mode==='wait')return;await p.locator('#state').filter({hasText:'CALLBACK'}).waitFor({timeout:3000});await p.locator('#visible').click();await p.locator('#not-required').click();await p.locator('#finish').click()}})}
finally{for(const s of [fixture,forbidden,proxy]){s.closeAllConnections();await new Promise(r=>s.close(r))}}
fs.writeFileSync(file,JSON.stringify({...result,sdkHits,frameHits,forbiddenHits},null,2),{flag:'wx'});
await new Promise(r=>process.send({type:'receipt',status:'complete'},r));process.disconnect();
