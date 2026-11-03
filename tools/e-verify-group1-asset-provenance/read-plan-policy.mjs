import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
const {parse}=require('parse5'),lexer=require('es-module-lexer');
await lexer.init;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pathParts=/^\/_astro\/([A-Za-z0-9_.-]+)\.([A-Za-z0-9_-]+)\.(js|css)$/;

// Offline read-plan admission only. This module has no HTTP or execution entry.
export class AssetReadPlan {
  #origin;#required;#known;#slots=new Map();#paths=new Map();#admitted=new Set();#counts=new Map();#stopped=false;
  constructor({origin,manifest,requiredTarget}){
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
    if(this.#paths.has(u.pathname))return;
    const count=this.#counts.get(key)||0;if(count>=this.#slots.get(key))this.#fail('STEM_MULTIPLICITY');
    this.#counts.set(key,count+1);this.#paths.set(u.pathname,{kind:m[3]==='js'?'script':'stylesheet',source});
  }
  #imports(text,base){
    let imports;try{[imports]=lexer.parse(text)}catch{this.#fail('MODULE_PARSE_FAILED')}
    for(const r of imports){if(r.d===-2)continue;if(typeof r.n!=='string')this.#fail('NON_LITERAL_IMPORT');this.#reference(r.n,base,'OBSERVED_PARENT_MODULE_IMPORT')}
  }
  observeHtml(bytes){
    this.#active();if(!Buffer.isBuffer(bytes)||bytes.length>2097152)this.#fail('HTML_BOUND');
    const stack=[parse(bytes.toString('utf8'))];let nodes=0;
    while(stack.length){if(++nodes>50000)this.#fail('HTML_NODE_BOUND');const n=stack.pop(),a=Object.fromEntries((n.attrs||[]).map(x=>[x.name,x.value]));
      if(n.tagName==='script'){
        if(a.src)this.#reference(a.src,this.#origin+'/login/','CURRENT_LOGIN_HTML');
        else if(a.type==='module')this.#imports((n.childNodes||[]).map(x=>x.value||'').join(''),this.#origin+'/login/');
      }
      if(n.tagName==='link'&&a.rel?.split(/\s+/).some(x=>['stylesheet','modulepreload'].includes(x)))this.#reference(a.href,this.#origin+'/login/','CURRENT_LOGIN_HTML');
      if(n.tagName==='astro-island')for(const k of ['component-url','renderer-url'])if(a[k])this.#reference(a[k],this.#origin+'/login/','CURRENT_LOGIN_HTML');
      stack.push(...(n.childNodes||[]));
    }
    if(!this.#paths.has(this.#required))this.#fail('TARGET_REFERENCE_CHANGED');
  }
  pending(){this.#active();return [...this.#paths.keys()].filter(p=>!this.#admitted.has(p))}
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
    this.#imports(bytes.toString('utf8'),this.#origin+pathname);
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
