import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
const {parse}=require('parse5'),lexer=require('es-module-lexer');
const postcss=require('postcss');
const moduleParser=require('@babel/parser');
await lexer.init;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pathParts=/^\/_astro\/([A-Za-z0-9_.-]+)\.([A-Za-z0-9_-]+)\.(js|css)$/;

// Finite, reference-derived admission only; this parser never fetches or evaluates code.
export class AssetReadPlan {
  #origin;#required;#known;#edges;#slots=new Map();#paths=new Map();#admitted=new Set();#counts=new Map();#stopped=false;
  constructor({origin,manifest,requiredTarget,edgeRules}){
    if(!edgeRules||typeof edgeRules!=='object'||Object.values(edgeRules).some(x=>!Array.isArray(x)||x.some(y=>typeof y!=='string')))throw new Error('REVIEWED_EDGES_REQUIRED');
    this.#edges=Object.freeze(Object.fromEntries(Object.entries(edgeRules).map(([p,v])=>[p,Object.freeze([...v])])));
    this.#origin=origin;this.#required=requiredTarget;this.#known=new Set(manifest.map(x=>x.path));
    for(const item of manifest){const m=pathParts.exec(item.path);if(!m)throw new Error('FINITE_MANIFEST_REQUIRED');const k=m[1]+'.'+m[3];this.#slots.set(k,(this.#slots.get(k)||0)+1)}
  }
  #fail(code){this.#stopped=true;throw new Error(code)}
  #active(){if(this.#stopped)throw new Error('PLAN_STOPPED')}
  #reference(raw,base,source){
    this.#active();let u;try{u=new URL(raw,base)}catch{this.#fail('ASSET_REFERENCE_FORBIDDEN')}
    if(u.href==='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')return;
    const m=pathParts.exec(u.pathname);
    if(u.origin!==this.#origin||u.protocol!=='https:'||u.username||u.password||u.search||u.hash
      ||u.pathname.length>256||!m||(!this.#known.has(u.pathname)&&m[2].length!==8))this.#fail('ASSET_REFERENCE_FORBIDDEN');
    const key=m[1]+'.'+m[3];if(!this.#slots.has(key))this.#fail('ASSET_REFERENCE_FORBIDDEN');
    const parent=new URL(base).pathname;
    const parentStem=parent.replace(/\.[A-Za-z0-9_-]+\.(js|css)$/,(_,e)=>'.'+e),childStem='/_astro/'+m[1]+'.'+m[3];
    if(!this.#edges[parentStem]?.includes(childStem))this.#fail('DEPENDENCY_EDGE_FORBIDDEN');
    if(this.#paths.has(u.pathname)){this.#paths.get(u.pathname).parents.add(parent);return}
    const count=this.#counts.get(key)||0;if(count>=this.#slots.get(key))this.#fail('STEM_MULTIPLICITY');
    this.#counts.set(key,count+1);this.#paths.set(u.pathname,{kind:m[3]==='js'?'script':'stylesheet',source,parents:new Set([parent])});
  }
  #imports(text,base){
    let imports;try{[imports]=lexer.parse(text)}catch{this.#fail('MODULE_PARSE_FAILED')}
    for(const r of imports){if(r.d===-2)continue;if(typeof r.n!=='string')this.#fail('NON_LITERAL_IMPORT');this.#reference(r.n,base,'OBSERVED_PARENT_MODULE_IMPORT')}
  }
  observeHtml(bytes,pagePath='/login/'){
    if(!Object.hasOwn(this.#edges,pagePath)||!pagePath.startsWith('/')||pagePath.includes('?'))this.#fail('HTML_SCOPE');
    this.#active();if(!Buffer.isBuffer(bytes)||bytes.length>2097152)this.#fail('HTML_BOUND');
    const stack=[parse(bytes.toString('utf8'))];let nodes=0;
    while(stack.length){if(++nodes>50000)this.#fail('HTML_NODE_BOUND');const n=stack.pop(),a=Object.fromEntries((n.attrs||[]).map(x=>[x.name,x.value]));
      if(n.tagName==='base')this.#fail('UNSUPPORTED_HTML_BASE');
      if(n.tagName==='script'){
        if(a.src)this.#reference(a.src,this.#origin+pagePath,'CURRENT_LOGIN_HTML');
        else if(a.type?.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,'').toLowerCase()==='module')this.#imports((n.childNodes||[]).map(x=>x.value||'').join(''),this.#origin+pagePath);
      }
      if(n.tagName==='link'&&a.rel?.split(/[\t\n\f\r ]+/).some(x=>['stylesheet','modulepreload'].includes(x.toLowerCase())))this.#reference(a.href,this.#origin+pagePath,'CURRENT_LOGIN_HTML');
      if(n.tagName==='astro-island')for(const k of ['component-url','renderer-url'])if(a[k])this.#reference(a[k],this.#origin+pagePath,'CURRENT_LOGIN_HTML');
      stack.push(...(n.childNodes||[]));
    }
    if(!this.#paths.has(this.#required))this.#fail('TARGET_REFERENCE_CHANGED');
  }
  pending(){this.#active();return [...this.#paths.keys()].filter(p=>!this.#admitted.has(p))}
  referenceGraph(){return [...this.#paths].map(([pathname,v])=>({path:pathname,kind:v.kind,parents:[...v.parents],readAdmitted:this.#admitted.has(pathname)}))}
  reserve(url,method,headers={}){
    this.#active();if(method!=='GET'||Object.keys(headers).some(k=>!['accept','accept-encoding'].includes(k.toLowerCase())))this.#fail('ANONYMOUS_GET_ONLY');
    let u;try{u=new URL(url)}catch{this.#fail('UNREFERENCED_ASSET')}
    if(u.origin!==this.#origin||u.username||u.password||u.search||u.hash||!this.#paths.has(u.pathname))this.#fail('UNREFERENCED_ASSET');
    if(this.#admitted.has(u.pathname))this.#fail('ASSET_REPLAY');
    if(this.#admitted.size>=this.#known.size)this.#fail('ASSET_BUDGET');
    this.#admitted.add(u.pathname);return {pathname:u.pathname,...this.#paths.get(u.pathname)};
  }
  async observeScript(pathname,bytes){
    this.#active();if(!this.#admitted.has(pathname)||this.#paths.get(pathname)?.kind!=='script'
      ||!Buffer.isBuffer(bytes)||bytes.length>2097152)this.#fail('SCRIPT_NOT_READ');
    try{moduleParser.parse(bytes.toString('utf8'),{sourceType:'module'})}catch{this.#fail('MODULE_PARSE_FAILED')}
    this.#imports(bytes.toString('utf8'),this.#origin+pathname);
  }
  observeStylesheet(pathname,bytes){
    this.#active();if(!this.#admitted.has(pathname)||this.#paths.get(pathname)?.kind!=='stylesheet')this.#fail('CSS_NOT_READ');
    let tree;try{tree=postcss.parse(bytes.toString('utf8'))}catch{this.#fail('CSS_PARSE_FAILED')}
    tree.walkAtRules(rule=>{
      if(rule.name.toLowerCase()!=='import')return;
      const m=/^(?:"([^"\\]+)"|'([^'\\]+)'|url\("([^"\\]+)"\))$/.exec(rule.params);
      if(!m)this.#fail('CSS_IMPORT_AMBIGUOUS');
      this.#reference(m[1]||m[2]||m[3],this.#origin+pathname,'OBSERVED_PARENT_CSS_IMPORT');
    });
  }
}
export function assertStaticResponse(kind,response){
  const fail=()=>{throw new Error('STATIC_RESPONSE_NOT_EVIDENCE')};
  const headers=Object.fromEntries(Object.entries(response.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  if(response.status!==200||Object.hasOwn(headers,'location')||Object.hasOwn(headers,'set-cookie')
    ||headers['content-encoding']&&headers['content-encoding']!=='identity'||!Buffer.isBuffer(response.body)||response.body.length>2097152)fail();
  const type=typeof headers['content-type']==='string'?headers['content-type'].split(';')[0].trim().toLowerCase():'';
  if(kind==='script'?!['application/javascript','text/javascript','application/ecmascript'].includes(type):kind!=='stylesheet'||type!=='text/css')fail();
  return {bytes:response.body.length,sha256:hash(response.body),sourceVerified:false};
}
