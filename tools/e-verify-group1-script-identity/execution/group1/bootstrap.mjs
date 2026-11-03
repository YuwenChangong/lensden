import {pathToFileURL} from 'node:url';
if (!process.connected || !process.argv[2]) throw new Error('SUPERVISED_START_REQUIRED');
process.channel.ref();
const ready=new Promise((resolve,reject)=>{
 const listener=message=>{if(message&&Object.keys(message).length===1&&message.type==='bootstrap-start'){process.off('message',listener);resolve()}};
 process.on('message',listener);process.once('disconnect',()=>reject(new Error('START_CLOSED')));
});
process.send({type:'supervisor-bootstrap-ready'},()=>{});
try{
 await ready;
 const entry=process.argv[2];process.argv=[process.execPath,entry,...process.argv.slice(3)];
 await import(pathToFileURL(entry).href);
}catch{process.exitCode=1;if(process.connected)process.disconnect()}
