import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
const rawRequest=http.request.bind(http);
const rawHttpsRequest=https.request.bind(https),rawTlsConnect=tls.connect.bind(tls),rawLookup=dns.lookup.bind(dns);
const rawConnect=net.Socket.prototype.connect;

// This transport can only talk to an explicitly selected local fixture.
// Production TLS/identity admission remains a separate, disabled capability.
export function loopbackTransport(origin){
  const base=new URL(origin);
  if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||!base.port||base.pathname!=='/'||base.search||base.username||base.password)throw new Error('LOOPBACK_ONLY');
  return boundedTransport(base,false);
}
export function exactHttpsTransport(origin,{ca}={}){
  const base=new URL(origin);
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('HTTPS_ORIGIN_REQUIRED');
  if(ca&&base.hostname!=='127.0.0.1')throw new Error('CUSTOM_CA_LOCAL_FIXTURE_ONLY');
  return boundedTransport(base,true,ca);
}
function boundedTransport(base,secure,ca){
  return (input,{maxBytes,timeoutMs=15000,signal,onResponse}={})=>new Promise((resolve,reject)=>{
    if(!Number.isSafeInteger(maxBytes)||maxBytes<0||!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)return reject(new Error('BOUNDS_REQUIRED'));
    if(signal?.aborted)return reject(new Error('REQUEST_ABORTED'));
    let logical;try{logical=new URL(input.url)}catch{return reject(new Error('TARGET_INVALID'))}
    if(logical.origin!==(secure?base.origin:'https://qa.example.invalid')||logical.username||logical.password||logical.hash)return reject(new Error('OFFLINE_FIXTURE_ONLY'));
    let done=false,total=0,timer,req,res;const chunks=[];
    const agent=secure?new https.Agent({keepAlive:false}):new http.Agent({keepAlive:false});
    agent.createConnection=options=>{
      const s=new net.Socket();Reflect.apply(rawConnect,s,[{...options,host:base.hostname,lookup:rawLookup}]);
      return secure?rawTlsConnect({...options,socket:s,servername:net.isIP(base.hostname)?undefined:base.hostname,ca,rejectUnauthorized:true}):s;
    };
    const finish=(code,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);agent.destroy();if(code){res?.destroy();req?.destroy();reject(new Error(code))}else resolve(result)};
    const abort=()=>finish('REQUEST_ABORTED');
    timer=setTimeout(()=>finish('REQUEST_TIMEOUT'),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    try{
      req=(secure?rawHttpsRequest:rawRequest)({hostname:base.hostname,port:Number(base.port)||(secure?443:80),path:logical.pathname+logical.search,
        method:input.method,headers:{...input.headers,'accept-encoding':'identity'},agent,maxHeaderSize:8192},response=>{
        res=response;
        // Retain only the caller's safe classification BEFORE stream/body failure.
        try{onResponse?.({status:res.statusCode,headers:res.headers})}catch{return finish('RESPONSE_OBSERVER_FAILURE')}
        if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')return finish('ENCODING_UNAPPROVED');
        const length=res.headers['content-length'];
        if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maxBytes))return finish('BODY_LIMIT');
        res.on('data',chunk=>{total+=chunk.length;if(total>maxBytes)return finish('BODY_LIMIT');chunks.push(chunk)});
        res.on('aborted',()=>finish('BODY_INCOMPLETE'));
        res.on('error',()=>finish('NETWORK_FAILURE'));
        res.on('end',()=>finish(null,{status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks,total),receivedBytes:total}));
      });
      req.on('error',()=>finish('NETWORK_FAILURE'));
      req.end(input.body);
    }catch{finish('NETWORK_FAILURE')}
  });
}
