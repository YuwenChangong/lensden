import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {sha256} from './hash.mjs';
export const SOURCE_ROOT='C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub';
const require=createRequire(SOURCE_ROOT+'/package.json'),lexer=require('es-module-lexer');await lexer.init;
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
const stem=p=>p.replace(/\.[A-Za-z0-9_-]+\.(js|css)$/,(_,e)=>'.'+e);
const read=p=>fs.readFileSync(p),json=p=>JSON.parse(read(p));
const localNames=['index.astro_astro_type_script_index_0_lang.BskClGKx.js','catalog-compare-dom.tKlnu0X0.js',
 'index.CXX0zyC2.css','AdminDevicesDashboard.hFDGJRVO.js','useAdminSession.B8o2Cihd.js','GlassConfirmDialog.BkjmaYBn.js'];
export function buildScope(){
 const proof=json(new URL('../e-verify-group1-production-binding/artifacts/PRODUCTION_RESOURCE_REVIEW_SAFE.json',import.meta.url));
 const original=json('C:/Temp/ogh-a-deploy-readiness-20261010/artifact-manifest.json');
 const manifest=proof.assets.map(x=>({path:x.path,kind:x.kind,bytes:x.bytes,sha256:x.sha256,provenance:'VERIFIED_REUSE_ONLY'}));
 const remaining=[],localBodies=new Map(),locals=new Map();
 for(const name of localNames){const p='/_astro/'+name,f=original.files.find(x=>x.path==='dist/client'+p),body=read(SOURCE_ROOT+'/dist/client'+p);
  if(!f||f.bytes!==body.length||f.sha256!==sha256(body))throw new Error('FROZEN_REFERENCE_CHANGED');
  const row={path:p,kind:p.endsWith('.js')?'script':'stylesheet',localReferenceSha256:f.sha256,productionContentSha256:null,provenance:'UNVERIFIED_CONDITIONAL_ONLY'};
  manifest.push(row);remaining.push(row);localBodies.set(p,body);
 }
 const serverFile=SOURCE_ROOT+'/dist/server/chunks/entrypoints_BIiJaWEe.mjs',ast=parser.parse(read(serverFile).toString(),{sourceType:'module'});
 let inline=null,inlinePath=null;
 traverse(ast,{StringLiteral(p){if(p.node.value.endsWith('/src/components/products/ProductDetail.astro?astro&type=script&index=0&lang.ts')){
  if(p.parent.type==='ArrayExpression'&&p.parent.elements[1]?.type==='StringLiteral')inline=p.parent.elements[1].value;
  if(p.parent.type==='ObjectProperty'&&p.parent.value?.type==='StringLiteral')inlinePath='/'+p.parent.value.value;
 }}});
 if(!inline||!/^\/_astro\/ProductDetail\.astro_astro_type_script_index_0_lang\.[A-Za-z0-9_-]{8}\.js$/.test(inlinePath||''))throw new Error('INLINE_CONTINGENCY_NOT_BOUND');
 const conditional={path:inlinePath,kind:'script',localReferenceSha256:sha256(Buffer.from(inline)),localInlineBytes:Buffer.byteLength(inline),productionContentSha256:null,
  provenance:'UNVERIFIED_ONLY_IF_DETAIL_HTML_EXTERNALIZES_FROZEN_INLINE_SCRIPT'};
 manifest.push(conditional);remaining.push(conditional);localBodies.set(inlinePath,Buffer.from(inline));
 for(const a of proof.assets){const body=read(SOURCE_ROOT+'/dist/client'+a.localPath);locals.set(a.path,body)}
 for(const [p,b]of localBodies)locals.set(p,b);
 const edges={};for(const [p,body]of locals){const key=stem(p);edges[key]??=[];
  if(p.endsWith('.js')){const [imports]=lexer.parse(body.toString());for(const i of imports){if(i.d===-2)continue;if(typeof i.n!=='string')throw new Error('LOCAL_NON_LITERAL_IMPORT');
   const u=new URL(i.n,'https://evidence.invalid'+p);if(u.origin!=='https://evidence.invalid'||u.search||u.hash)throw new Error('LOCAL_EXTERNAL_IMPORT');
   edges[key].push(stem(u.pathname));
  }}
 }
 const loginRoots=proof.graph.filter(x=>x.parents.includes('/login/')).map(x=>stem(x.path));
 const common=loginRoots.filter(x=>x!=='/_astro/AuthPanel.js');
 edges['/login/']=loginRoots;
 edges['/products/']=[...common,stem(remaining[0].path),stem(remaining[2].path)];
 edges['/products/xreal/xreal-air/']=[...common,stem(inlinePath)];
 edges['/admin/devices/']=[...common,stem(remaining[3].path)];
 const known=new Set(manifest.map(x=>stem(x.path)));
 for(const [p,items]of Object.entries(edges)){edges[p]=[...new Set(items)].sort();if(items.some(x=>!known.has(x)))throw new Error('LOCAL_GRAPH_OUTSIDE_SCOPED_MANIFEST')}
 const requiredRoots={'/products/':[stem(remaining[0].path)],'/products/xreal/xreal-air/':[], '/admin/devices/':[stem(remaining[3].path)]};
 return {manifest,remainingSlots:remaining,edgeRules:edges,requiredRoots,reusedAssets:manifest.slice(0,23),
  inlineContingency:{source:'src/components/products/ProductDetail.astro',compiledSource:serverFile,bytes:conditional.localInlineBytes,
   sha256:conditional.localReferenceSha256,onlyIfExplicitlyReferenced:true},
  sourceInputs:[SOURCE_ROOT+'/src/pages/products/index.astro',SOURCE_ROOT+'/src/pages/products/[brand]/[slug].astro',SOURCE_ROOT+'/src/pages/admin/devices/index.astro',
   SOURCE_ROOT+'/src/components/products/ProductDetail.astro',SOURCE_ROOT+'/src/components/admin/AdminDevicesDashboard.tsx',SOURCE_ROOT+'/src/components/admin/useAdminSession.ts',serverFile]};
}
