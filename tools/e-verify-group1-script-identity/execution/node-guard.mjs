import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import worker from 'node:worker_threads';
import child from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
let installed=false;
export function installNodeGuard(onDeny=()=>{}){
  if(installed)throw new Error('NODE_GUARD_ALREADY_INSTALLED');
  installed=true;
  const deny=()=>{onDeny();throw new Error('UNCONTROLLED_NODE_EGRESS')};
  const lock=(o,k,value)=>Object.defineProperty(o,k,{value,writable:false,configurable:false});
  for(const m of [http,https])for(const k of ['request','get'])lock(m,k,deny);
  for(const k of ['connect','createConnection'])lock(net,k,deny);
  lock(net.Socket.prototype,'connect',deny);lock(tls,'connect',deny);
  for(const module of [dns,dns.promises]){
    for(const k of Object.getOwnPropertyNames(module))if(/^(lookup|resolve|reverse|setServers)/.test(k)&&typeof module[k]==='function')lock(module,k,deny);
    const Resolver=module.Resolver;
    for(let p=Resolver.prototype;p&&p!==Object.prototype;p=Object.getPrototypeOf(p)){
      for(const k of Object.getOwnPropertyNames(p))if(/^(resolve|reverse|setServers)/.test(k)&&typeof p[k]==='function')lock(p,k,deny);
    }
    lock(module,'Resolver',class{constructor(){deny()}});
  }
  for(const k of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])lock(child,k,deny);
  lock(worker,'Worker',class{constructor(){deny()}});
  lock(globalThis,'fetch',()=>Promise.reject(deny()));
  lock(globalThis,'WebSocket',class{constructor(){deny()}});
  syncBuiltinESMExports();
  return Object.freeze({installed:true,scope:'FIXED_RUNNER_MODULES_NOT_HOSTILE_NATIVE_CODE_SANDBOX'});
}
