import test from 'node:test';
import assert from 'node:assert/strict';
import {compareModules,sha} from './semantic.mjs';
import {StaticEvidencePolicy} from './policy.mjs';

const known=new Set(['/_astro/a.js','/_astro/b.js','/_astro/react.js']);
const compare=(a,b,review)=>compareModules(Buffer.from(a),Buffer.from(b),'/_astro/a.12345678.js','/_astro/a.87654321.js',known,review);
test('literal import hash differences and alpha-renaming are visible scoped AST matches',()=>{
 assert.equal(compare('import {x as a} from "./b.12345678.js";export function f(b){return a+b}',
  'import {x as q} from "./b.87654321.js";export function f(z){return q+z}').matches,true);
});
for(const [label,other]of [
 ['extra network call','fetch("https://unknown.invalid")'],['different literal','const x=2;export {x}'],
 ['changed operation','const x=1+2;export {x}'],['extra effect','const x=1;console.log(x);export {x}'],
])test(label+' cannot match the frozen module',()=>assert.equal(compare('const x=1;export {x}',other).matches,false));
test('changed imported symbol is not hash normalization',()=>assert.equal(compare('import {x} from "./b.12345678.js";export {x}', 'import {y as x} from "./b.87654321.js";export {x}').matches,false));
for(const source of ['import x from "https://bad.invalid/b.js"','import x from "./b.12345678.js?token=hidden"','import x from "./unknown.12345678.js"','import("./"+name)','import "./b.12345678.js"'])
 test('unproven import fails closed '+sha(Buffer.from(source)).slice(0,8),()=>assert.throws(()=>compare(source,'export default 1')));
test('React factory movement is not a general normalization',()=>{
 const a='import {r,t} from "./react.12345678.js";const x=r(t(),1);const y=1;export {x,y}';
 const b='import {r,t} from "./react.87654321.js";const y=1;const x=r(t(),1);export {x,y}';
 assert.equal(compare(a,b).matches,false);
 assert.throws(()=>compare(a,b,{reviewedReactFactoryMove:true,actualSha256:'0'.repeat(64),localSha256:sha(Buffer.from(b))}),/HASH_MISMATCH/);
});
test('import evaluation order is not a general normalization',()=>{
 const a='import {x} from "./b.12345678.js";import {r} from "./react.12345678.js";export {x,r}';
 const b='import {r} from "./react.87654321.js";import {x} from "./b.87654321.js";export {x,r}';
 assert.equal(compare(a,b).matches,false);
});
const row={path:'/_astro/a.12345678.js',kind:'script',bytes:4,sha256:sha(Buffer.from('test')),provenance:'VERIFIED',version:'b2b62ec9-bb8d-4159-ac99-08fca5740134'};
const origin='https://app.example.invalid',version='b2b62ec9-bb8d-4159-ac99-08fca5740134';
function gate(){return new StaticEvidencePolicy({origin,version,assets:[row]})}
const request={url:origin+row.path,method:'GET',actor:'A'},meta={stage:'LOGIN_A',resourceType:'script'};
test('exact production static binding is admitted before transport',()=>assert.equal(gate().assertRequest(request,meta,version).path,row.path));
for(const [label,q,m,v]of [
 ['old hash',{...request,url:origin+'/_astro/a.87654321.js'},meta,version],
 ['host',{...request,url:'https://other.invalid'+row.path},meta,version],
 ['method',{...request,method:'POST'},meta,version],
 ['actor',{...request,actor:'B'},meta,version],
 ['stage',request,{...meta,stage:'UNBOUND'},version],
 ['resource type',request,{...meta,resourceType:'fetch'},version],
 ['query',{...request,url:request.url+'?private=hidden'},meta,version],
 ['version',request,meta,'00000000-0000-4000-8000-000000000001'],
])test('static binding rejects '+label,()=>assert.throws(()=>gate().assertRequest(q,m,v)));
test('actual bytes and SHA remain mandatory',()=>{
 assert.equal(gate().assertBody(row.path,Buffer.from('test')),true);
 assert.throws(()=>gate().assertBody(row.path,Buffer.from('fail')));
 assert.throws(()=>gate().assertBody(row.path,Buffer.from('test!')));
});
test('missing deployment identity cannot satisfy equality with another missing identity',()=>{
 assert.throws(()=>new StaticEvidencePolicy({origin,assets:[row]}));
});
test('asset row from another version is not a verified current deployment resource',()=>{
 assert.throws(()=>new StaticEvidencePolicy({origin,version,assets:[{...row,version:'00000000-0000-4000-8000-000000000001'}]}));
});
test('import-order exception cannot be used for arbitrary same-stem modules',()=>{
 assert.throws(()=>compare('import {x} from "./b.12345678.js";export {x}', 'import {x} from "./b.87654321.js";export {x}',{reviewedImportOrder:true}));
});
