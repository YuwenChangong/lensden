import fs from 'node:fs';
import {sha,ID}from'./authorization.mjs';
export function verifyFrozen(directory){
 const packetBytes=fs.readFileSync(directory+'/PACKET_NOT_AUTHORIZED.json'),bindingBytes=fs.readFileSync(directory+'/EXECUTION_BINDING.json');
 const packet=JSON.parse(packetBytes),binding=JSON.parse(bindingBytes);
 if(packet.authorizationId!==ID||binding.authorizationId!==ID||binding.packetSha256!==sha(packetBytes)||packet.status!=='PENDING_OWNER_APPROVAL'||packet.liveRequestsAuthorized!==false)throw new Error('FROZEN_BINDING_INVALID');
 if(packet.budgets.global!==650||packet.budgets.thirdParty!==1||packet.budgets.POST!==0||packet.budgets.document!==0||packet.hardDeadlineSeconds!==300||packet.maxAdditionalCostUSD!==0||packet.sdkExecutionAllowed!==false)throw new Error('BUDGET_BINDING_INVALID');
 for(const f of binding.files)if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('FROZEN_FILE_DRIFT');
 if(process.execPath.toLowerCase().replaceAll('\\','/')!==binding.nodePath.toLowerCase().replaceAll('\\','/'))throw new Error('NODE_IDENTITY_DRIFT');
 return{packetHash:sha(packetBytes),bindingHash:sha(bindingBytes),packet,binding};
}
