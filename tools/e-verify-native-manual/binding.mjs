import fs from'node:fs';import {ID,sha}from'./authorization.mjs';
export function verifyFrozen(d){
 const pb=fs.readFileSync(d+'/PACKET_NOT_AUTHORIZED.json'),bb=fs.readFileSync(d+'/EXECUTION_BINDING.json'),p=JSON.parse(pb),b=JSON.parse(bb);
 if(p.authorizationId!==ID||b.authorizationId!==ID||sha(pb)!==b.packetSha256||p.status!=='PENDING_OWNER_APPROVAL'||p.liveRequestsAuthorized!==false||p.old65040HardCapInherited!==false||p.maxAdditionalCostUSD!==0||p.fullGroup1Authorized!==false)throw new Error('BINDING_INVALID');
 for(const f of b.files)if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('FROZEN_FILE_DRIFT');
 if(process.execPath.toLowerCase().replaceAll('\\','/')!==b.nodePath.toLowerCase().replaceAll('\\','/'))throw new Error('NODE_IDENTITY_DRIFT');
 return{packetHash:sha(pb),bindingHash:sha(bb),packet:p,binding:b};
}
