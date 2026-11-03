import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
const parser=req('@babel/parser'),traverse=req('@babel/traverse').default;
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const stem=p=>p.replace(/\.[A-Za-z0-9_-]+\.(js|css)$/,(m,e)=>'.'+e);
const omit=new Set(['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments']);
function clean(x){if(Array.isArray(x))return x.map(clean);if(x&&typeof x==='object'){const out={};for(const [k,v]of Object.entries(x))if(!omit.has(k))out[k]=clean(v);return out}return x}
function canonicalImport(value,route,known){const u=new URL(value,'https://evidence.invalid'+route);if(u.origin!=='https://evidence.invalid'||u.search||u.hash||u.username||u.password||!known.has(stem(u.pathname)))throw new Error('UNPROVEN_IMPORT');return stem(u.pathname)}
export function canonicalModule(bytes,route,known,{reviewedReactFactoryMove=false,reviewedImportOrder=false}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>2097152)throw new Error('SOURCE_BOUND');
 let ast;try{ast=parser.parse(bytes.toString('utf8'),{sourceType:'module'})}catch{throw new Error('SOURCE_PARSE_FAILED')}
 const imports=[],factories=[];let program;
 traverse(ast,{Program(p){program=p;p.scope.crawl();p.stop()}});
 for(const statement of ast.program.body){if(statement.type==='ImportDeclaration'){
   if(!statement.specifiers.length)throw new Error('SIDE_EFFECT_ONLY_IMPORT_REVIEW_REQUIRED');
   statement.source.value=canonicalImport(statement.source.value,route,known);
   imports.push({source:statement.source.value,symbols:statement.specifiers.map(s=>s.imported?.name||s.imported?.value||s.type).sort()});
 }}
 // Only the known frozen lazy React namespace getter may change declaration position.
 const react=ast.program.body.flatMap(s=>s.type==='ImportDeclaration'&&s.source.value==='/_astro/react.js'?s.specifiers.filter(x=>x.imported?.name==='r').map(x=>x.local.name):[]);
 const getters=ast.program.body.flatMap(s=>s.type==='ImportDeclaration'&&s.source.value==='/_astro/react.js'?s.specifiers.filter(x=>x.imported?.name==='t').map(x=>x.local.name):[]);
 for(const s of ast.program.body)if(s.type==='VariableDeclaration')for(const d of s.declarations){
   const args=d.init?.arguments;
   if(d.id.type==='Identifier'&&d.init?.type==='CallExpression'&&d.init.callee.type==='Identifier'&&react.includes(d.init.callee.name)
     &&args.length===2&&args[0].type==='CallExpression'&&args[0].callee.type==='Identifier'&&getters.includes(args[0].callee.name)&&args[0].arguments.length===0&&args[1].type==='NumericLiteral'&&args[1].value===1)
     factories.push({s,d,name:d.id.name,callee:d.init.callee.name,getter:args[0].callee.name});
 }
 if(factories.length>1)throw new Error('REACT_FACTORY_MULTIPLICITY');
 const firstDeclaration=ast.program.body.findIndex(s=>s.type==='VariableDeclaration');
 const prologue=ast.program.body.slice(0,firstDeclaration<0?0:firstDeclaration).filter(s=>s.type==='ExpressionStatement');
 if(factories.length&&reviewedReactFactoryMove){const f=factories[0],factoryBinding=program.scope.getBinding(f.name),reactBinding=program.scope.getBinding(f.callee),getterBinding=program.scope.getBinding(f.getter);
   const checked=new Set();function referencesFactory(binding){if(!binding||checked.has(binding))return false;checked.add(binding);let unsafe=false;
     binding.path.traverse({ReferencedIdentifier(p){const b=p.scope.getBinding(p.node.name);if(b===factoryBinding||b===reactBinding||b===getterBinding)unsafe=true;else if(b?.scope===program.scope&&b.path.isFunctionDeclaration()&&referencesFactory(b))unsafe=true}});return unsafe;
   }
   for(const s of ast.program.body){if(s.type==='VariableDeclaration')for(const d of s.declarations){if(d===f.d||!d.init)continue;
     if(d.init.type==='CallExpression'&&d.init.callee.type==='Identifier'&&referencesFactory(program.scope.getBinding(d.init.callee.name)))throw new Error('REACT_FACTORY_ORDER_DEPENDENCY');
   }else if(s.type==='ExpressionStatement'&&!prologue.includes(s)&&s.expression.type!=='StringLiteral')throw new Error('TOP_LEVEL_EFFECT_REVIEW_REQUIRED')}
   f.s.declarations=f.s.declarations.filter(d=>d!==f.d);ast.program.body=ast.program.body.filter(s=>s!==f.s||s.declarations.length);
 }
 const importNodes=ast.program.body.filter(s=>s.type==='ImportDeclaration');
 if(reviewedImportOrder)importNodes.sort((a,b)=>a.source.value.localeCompare(b.source.value));
 ast.program.body=reviewedReactFactoryMove
   ?[...importNodes,...prologue,...factories.map(f=>({type:'VariableDeclaration',kind:f.s.kind,declarations:[f.d]})),...ast.program.body.filter(s=>s.type!=='ImportDeclaration'&&!prologue.includes(s))]
   :reviewedImportOrder?[...importNodes,...ast.program.body.filter(s=>s.type!=='ImportDeclaration')]:ast.program.body;
 program.scope.crawl();let scopeCount=0;const scopes=new Set();
 traverse(ast,{Scope(p){if(scopes.has(p.scope))return;scopes.add(p.scope);const scope=scopeCount++;const names=Object.keys(p.scope.bindings);for(let i=0;i<names.length;i++)p.scope.rename(names[i],'__qa_scope_'+scope+'_binding_'+i)}});
 traverse(ast,{ImportDeclaration(p){p.node.specifiers.sort((a,b)=>(a.imported?.name||a.type).localeCompare(b.imported?.name||b.type))},CallExpression(p){if(p.node.callee.type==='Import'){if(p.node.arguments.length!==1||p.node.arguments[0].type!=='StringLiteral')throw new Error('NON_LITERAL_IMPORT');p.node.arguments[0].value=canonicalImport(p.node.arguments[0].value,route,known)}}});
 const tree=clean(ast);return {canonicalSha256:sha(Buffer.from(JSON.stringify(tree))),importSet:imports.sort((a,b)=>a.source.localeCompare(b.source)),reactFactoryPositionCanonicalized:reviewedReactFactoryMove&&factories.length===1};
}
export function compareModules(actual,local,actualRoute,localRoute,known,review={}){
 if(actual.equals(local))return{matches:true,kind:'EXACT_FROZEN_BUILD_BYTES'};
 if(review.reviewedReactFactoryMove&&(review.actualSha256!=='991ebf58bed99754cc2f4436bfafb830de70fb720a73897b1efa05fd3a32eb3c'
  ||review.localSha256!=='7ef9768e2be3f702e430a9ede82666c6ffab59095f711438a7b82ba4087df8e9'
  ||sha(actual)!==review.actualSha256||sha(local)!==review.localSha256))throw new Error('REVIEWED_PAIR_HASH_MISMATCH');
 if(review.reviewedImportOrder&&!new Set([
  'c089c71a3eb20cf7c6a340b5c47ead959a40e2f87aa56556f7a7b5adb55400df:0079ae4f333a8fd54c310b05c96c718a7be2450694fd4cbb9de0330098e1b629',
  '87f2cd770b3cc9e9bd026a3ec8bc6ccefaecf335885b66af71d03e1c5f434399:d3075d29fcf86e108a9c1b08f2bf346f95e1675b34074d25403180d62b3352a9',
 ]).has(sha(actual)+':'+sha(local)))throw new Error('REVIEWED_IMPORT_PAIR_MISMATCH');
 const a=canonicalModule(actual,actualRoute,known,review),l=canonicalModule(local,localRoute,known,review);
 return{matches:a.canonicalSha256===l.canonicalSha256&&JSON.stringify(a.importSet)===JSON.stringify(l.importSet),kind:'SCOPED_AST_REVIEW_NOT_GENERAL_SEMANTIC_EQUIVALENCE',canonicalHash:a.canonicalSha256,localCanonicalHash:l.canonicalSha256,reactFactoryPositionCanonicalized:a.reactFactoryPositionCanonicalized||l.reactFactoryPositionCanonicalized};
}
