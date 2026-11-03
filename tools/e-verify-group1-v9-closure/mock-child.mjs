import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {waitForStart} from '../e-verify-group1-remaining-assets/supervisor.mjs';
import {fullFlowFixture} from './full-flow-fixture.mjs';
await waitForStart();
try{
 const target=path.resolve(process.argv[2]),mode=process.argv[3]||'normal';
 if(!target.startsWith(path.join(os.tmpdir(),'ogh-group1-v9-'))||!['normal','wrong-identity','low-budget','hang','measurement'].includes(mode))throw new Error('FIXTURE_OUTPUT_SCOPE');
 const result=await fullFlowFixture({wrongIdentity:mode==='wrong-identity',globalLimit:mode==='low-budget'?3:undefined,measurementOnly:mode==='measurement',
   onBrowserReady:async n=>{if(n===1&&mode==='hang'){if(process.connected)process.send({type:'phase',phase:'started'});await new Promise(()=>{})}}});
 fs.writeFileSync(target,JSON.stringify(result)+'\n',{flag:'wx'});
 if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r));
}catch(e){process.exitCode=1}finally{if(process.connected)process.disconnect()}
