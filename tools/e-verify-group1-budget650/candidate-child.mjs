import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {waitForStart} from '../e-verify-group1-remaining-assets/supervisor.mjs';
import {fullFlowFixture} from '../e-verify-group1-v9-closure/full-flow-fixture.mjs';
import {PROPOSED} from './candidate.mjs';
await waitForStart();
try{
 const output=path.resolve(process.argv[2]);
 if(!output.startsWith(path.join(os.tmpdir(),'ogh-group1-budget650-')))throw new Error('CANDIDATE_OUTPUT_SCOPE');
 // The existing runner only receives a synthetic loopback fixture override.
 // No protected budget/production packet, identity or approval is written.
 const result=await fullFlowFixture({globalLimit:PROPOSED});
 if(result.fixtureAdmissionMax!==PROPOSED||result.approvedGlobalMax!==500||!result.savedOwnerCapsUnchanged||result.productionCompatible!==false)throw new Error('CANDIDATE_SCOPE_CHANGED');
 result.candidateOnly=true;result.ownerBudgetChangeApproved=false;
 fs.writeFileSync(output,JSON.stringify(result)+'\n',{flag:'wx'});
 if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r));
}catch{process.exitCode=1}finally{if(process.connected)process.disconnect()}
