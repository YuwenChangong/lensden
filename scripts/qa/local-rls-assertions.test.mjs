import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLocalCatalog } from './local-rls-assertions.mjs';
const step={actor:'anon',kind:'legacy',expect:'deny'};
const payload={code:'42501',message:'permission denied for table devices',details:null,hint:'A valid database hint'};
const response=(status,data)=>({status,body:Buffer.from(JSON.stringify(data))});
test('401 permission denial with a hint remains a real denial',()=>assert.equal(verifyLocalCatalog(step,response(401,payload)),true));
test('403 permission denial without a hint still passes',()=>assert.equal(verifyLocalCatalog(step,response(403,{...payload,hint:null})),true));
for(const [name,status,data] of [
 ['server failure',500,payload],['successful error-shaped body',200,payload],
 ['private rows',200,[{private:'data'}]],['wrong SQLSTATE',401,{...payload,code:'XX000'}],
 ['extra data',401,{...payload,rows:[{private:'data'}]}],
 ['wrong relation',401,{...payload,message:'permission denied for table profiles'}],
 ['structured hint',401,{...payload,hint:{rows:['private']}}],
]) test('rejects '+name,()=>assert.throws(()=>verifyLocalCatalog(step,response(status,data))));
