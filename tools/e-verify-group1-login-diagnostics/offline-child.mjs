import {waitForStart} from './execution/group1/supervisor.mjs';
await waitForStart();
if(process.argv[2]==='hang')await new Promise(r=>setTimeout(r,5000));
else if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r));
if(process.connected)process.disconnect();
