import test from'node:test';
import assert from'node:assert/strict';
import http from'node:http';
import {loopbackTransport}from'./wire.mjs';
import {ResponseJournal}from'./response-diagnostics.mjs';
for(const mode of ['ok','redirect','no-location','body-failure','length-limit','network-error'])test('real HTTP loopback header/stream '+mode,async()=>{
 const server=http.createServer((q,r)=>{
  if(mode==='network-error'){q.socket.destroy();return}
  r.writeHead(mode==='redirect'?302:mode==='no-location'?307:200,{'content-type':'application/javascript',
   ...(mode==='redirect'?{location:'https://evil.invalid/private?token=PRIVATE_SENTINEL'}:{}),
   ...(mode==='length-limit'?{'content-length':'99999'}:mode==='body-failure'?{'content-length':'100'}:{})});
  if(mode==='body-failure'){r.flushHeaders();setTimeout(()=>r.destroy(),20);return}r.end('fixture');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const send=loopbackTransport('http://127.0.0.1:'+server.address().port),j=new ResponseJournal();j.start(1);
 try{await send({url:'https://qa.example.invalid/sdk',method:'GET',headers:{},body:Buffer.alloc(0)},
  {maxBytes:1024,timeoutMs:1000,onResponse:r=>j.headers(1,r)});
 }catch(e){j.fail(1,e.message)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
 const r=j.receipt()[0];assert.ok(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));
 if(mode==='network-error'){assert.equal(r.HTTP_STATUS_CODE,null);assert.equal(r.RESPONSE_HEADERS_OBSERVED,false);assert.equal(r.SDK_RESPONSE_REJECTION_REASON,'NETWORK_FAILURE')}
 else{assert.equal(r.RESPONSE_HEADERS_OBSERVED,true);assert.equal(r.HTTP_STATUS_CODE,mode==='redirect'?302:mode==='no-location'?307:200)}
 if(mode==='body-failure')assert.equal(r.SDK_RESPONSE_REJECTION_REASON,'BODY_INCOMPLETE');
 if(mode==='length-limit')assert.equal(r.SDK_RESPONSE_REJECTION_REASON,'BODY_LIMIT');
 if(mode==='redirect'){assert.equal(r.LOCATION_HEADER_PRESENT,true);assert.equal(r.LOCATION_TARGET_SAME_ALLOWED_HOST,false)}
});
