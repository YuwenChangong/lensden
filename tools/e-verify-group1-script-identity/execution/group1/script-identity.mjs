import {createRequire} from 'node:module';

const require=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
const {parse}=require('parse5');
const lexer=require('es-module-lexer');
await lexer.init;
const buildPath=/^\/_astro\/([A-Za-z0-9_.-]+)\.([A-Za-z0-9_-]{8})\.js$/;
const blocked=()=>({status:'PRIVACY_BLOCKED',publicPathname:null,referenceSource:null,contentVerified:false});

// Public identity evidence is not a transport capability or script-content proof.
export class ScriptIdentityEvidence {
  #origin;#actor;#static;#stems;#references=new Map();
  constructor({appOrigin,actor,staticPaths=[]}){
    this.#origin=appOrigin;this.#actor=actor;this.#static=new Set(staticPaths);
    this.#stems=new Set(staticPaths.map(p=>buildPath.exec(p)?.[1]).filter(Boolean));
  }
  #target(raw,base){
    try{
      if(typeof raw!=='string'||raw.length>4096)return null;
      const u=new URL(raw,base),m=buildPath.exec(u.pathname);
      if(u.origin!==this.#origin||u.protocol!=='https:'||u.username||u.password
        ||!m||!this.#stems.has(m[1])||u.pathname.length>256)return null;
      return u.pathname;
    }catch{return null}
  }
  #add(raw,base,source){
    const p=this.#target(raw,base);
    if(p&&this.#references.size<256&&!this.#references.has(p))this.#references.set(p,source);
  }
  #imports(text,base,source){
    try{const [imports]=lexer.parse(text);for(const r of imports)if(typeof r.n==='string')this.#add(r.n,base,source)}catch{}
  }
  async observeLoginHtml(bytes,sourceUrl){
    let u;try{u=new URL(sourceUrl)}catch{return}
    if(u.origin!==this.#origin||u.pathname!=='/login/'||u.username||u.password
      ||!Buffer.isBuffer(bytes)||bytes.length>2097152)return;
    const tree=parse(bytes.toString('utf8')),stack=[tree];let visited=0;
    while(stack.length&&visited++<50000){
      const node=stack.pop(),attrs=Object.fromEntries((node.attrs||[]).map(a=>[a.name,a.value]));
      if(node.tagName==='script'){
        if(attrs.src)this.#add(attrs.src,u.href,'VALIDATED_LOGIN_HTML');
        else if(attrs.type==='module')this.#imports((node.childNodes||[]).map(n=>n.value||'').join(''),u.href,'VALIDATED_LOGIN_HTML');
      }
      if(node.tagName==='link'&&attrs.rel?.split(/\s+/).includes('modulepreload'))this.#add(attrs.href,u.href,'VALIDATED_LOGIN_HTML');
      if(node.tagName==='astro-island')for(const key of ['component-url','renderer-url'])this.#add(attrs[key],u.href,'VALIDATED_LOGIN_HTML');
      // Inert template content is deliberately not trusted as a loading source.
      stack.push(...(node.childNodes||[]));
    }
  }
  async observeBoundScript(bytes,sourceUrl){
    let u;try{u=new URL(sourceUrl)}catch{return}
    if(u.origin!==this.#origin||u.username||u.password||u.search||u.hash
      ||!this.#static.has(u.pathname)||!u.pathname.endsWith('.js')
      ||!Buffer.isBuffer(bytes)||bytes.length>2097152)return;
    this.#imports(bytes.toString('utf8'),u.href,'VERIFIED_BOUND_SCRIPT_IMPORT');
  }
  describe(request,meta){
    if(this.#actor!=='A'||request.actor!=='A'||request.method!=='GET'
      ||meta?.stage!=='LOGIN_A'||meta.resourceType!=='script')return blocked();
    const p=this.#target(request.url,this.#origin+'/');
    if(!p)return blocked();
    if(this.#static.has(p))return {status:'MANIFEST_MATCH',publicPathname:p,referenceSource:'FROZEN_LOCAL_MANIFEST',contentVerified:false};
    const source=this.#references.get(p);
    return source?{status:'PUBLIC_REFERENCE_UNMATCHED',publicPathname:p,referenceSource:source,contentVerified:false}:blocked();
  }
}
