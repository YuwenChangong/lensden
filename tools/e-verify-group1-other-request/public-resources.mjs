import {createRequire} from 'node:module';import {createHash,createHmac,randomBytes} from 'node:crypto';
const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
const parse=req('parse5').parse;
const knownPages=new Set(['/login/','/products/','/products/xreal/xreal-air/','/admin/devices/']);
const stages=new Map([['LOGIN_A','A'],['LOGIN_B','B'],['LOGIN_ADMIN','ADMIN'],['NEGATIVE_CAPTCHA','A'],['NEGATIVE_MISSING_CAPTCHA','A'],['NEGATIVE_PASSWORD','A']]);
const hash=x=>createHash('sha256').update(x).digest('hex');
export class ReviewedPublicResources{
 #origin;#db;#actor;#icons=new Map();#manifest;#salt=randomBytes(32);
 constructor({appOrigin,actor,staticManifest=[],supabaseOrigin='https://xcbnxzjlsvtgzixurcof.supabase.co'}){this.#origin=new URL(appOrigin).origin;this.#db=new URL(supabaseOrigin).origin;this.#actor=actor;this.#manifest=new Map(staticManifest.map(x=>[x.path,x]))}
 // Caller must first perform the existing strict page-byte/source/identity checks.
 observeValidatedHtml(bytes,url){
  const page=new URL(url);if(page.origin!==this.#origin||!knownPages.has(page.pathname)||!Buffer.isBuffer(bytes)||bytes.length>2097152)throw new Error('OBSERVATION_PAGE_SCOPE');
  const nodes=[parse(bytes.toString('utf8'))];
  while(nodes.length){const n=nodes.pop(),a=Object.fromEntries((n.attrs||[]).map(x=>[x.name,x.value]));
   if(n.tagName==='link'&&['icon','shortcut icon','apple-touch-icon'].includes((a.rel||'').toLowerCase())&&a.href){
    let u;try{u=new URL(a.href,page)}catch{}
    if(u&&u.protocol==='https:'&&u.origin===this.#origin&&!u.search&&!u.hash&&!u.username&&!u.password&&/^\/[A-Za-z][A-Za-z0-9_.-]{0,100}\.(?:ico|png|svg)$/.test(u.pathname)&&!/token|secret|session|password|@|[a-f0-9]{8}-[a-f0-9-]{27}/i.test(u.pathname)){
     this.#icons.set(u.pathname,{path:u.pathname,referenceKind:'VALIDATED_HTML_DOCUMENT_ICON',page:page.pathname,htmlSha256:hash(bytes),rel:a.rel.toLowerCase(),contentBytesVerified:false});
    }
   }
   nodes.push(...(n.childNodes||[]));
  }
 }
 observe(request,meta={}){
  let u;try{u=new URL(request.url)}catch{}
  const originClass=u?.origin===this.#origin?'APPLICATION':u?.origin===this.#db?'SUPABASE':u?.origin==='https://challenges.cloudflare.com'?'TURNSTILE':'OTHER_OR_INVALID';
  const clean=!!u&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;
  const icon=clean&&originClass==='APPLICATION'?this.#icons.get(u.pathname):null;
  const asset=clean&&originClass==='APPLICATION'?this.#manifest.get(u.pathname):null;
  const actor=request.actor??this.#actor,actorStageMatch=actor===this.#actor&&stages.get(meta.stage)===actor;
  const safeFrame=new Set(['APPLICATION_MAIN_FRAME','APPLICATION_CHILD_FRAME','TURNSTILE_FRAME','UNAPPROVED_FRAME','NO_FRAME_OR_UNAVAILABLE']);
  const d={stage:stages.has(meta.stage)?meta.stage:'UNKNOWN',actor:['A','B','ADMIN'].includes(actor)?actor:'UNKNOWN',method:['GET','POST','HEAD','OPTIONS','DELETE','PUT','PATCH'].includes(request.method)?request.method:'UNKNOWN',
   requestSource:['BROWSER_NAVIGATION','BROWSER_RESOURCE','BROWSER_FETCH','CONTROLLED_NODE_READ'].includes(meta.source)?meta.source:'UNKNOWN',
   originClass,protocolClass:u?.protocol==='https:'?'HTTPS':u?.protocol==='http:'?'HTTP':u?'OTHER':'INVALID',resourceType:typeof meta.resourceType==='string'&&/^[a-z]{1,20}$/.test(meta.resourceType)?meta.resourceType:'UNKNOWN',
   frameClass:safeFrame.has(meta.frameClass)?meta.frameClass:'NO_FRAME_OR_UNAVAILABLE',initiator:'NOT_EXPOSED_BY_PLAYWRIGHT_REQUEST',
   publicPathname:icon?.path||asset?.path||null,routeShape:icon?'DOCUMENT_ICON_LITERAL':asset?'VERIFIED_STATIC_LITERAL':u?.pathname==='/'?'ROOT':u?.pathname.startsWith('/api/')?'API_LIKE_REDACTED':u?'UNBOUND_REDACTED':'INVALID',
   verifiedResourceMatch:!!asset,htmlReferenceMatch:!!icon,referenceKind:icon?.referenceKind||null,htmlEvidenceSha256:icon?.htmlSha256||null,contentBytesVerified:!!asset,
   queryPresent:!!u?.search,fragmentPresent:!!u?.hash,credentialEnvelopePresent:!!(u?.username||u?.password),actorStageMatch,
   evidenceId:u?createHmac('sha256',this.#salt).update(originClass+'\0'+u.pathname).digest('hex'):null,
   evidenceIdBoundary:'PER_RUN_KEYED_PATH_ONLY_NO_QUERY_NO_REVERSIBLE_DICTIONARY',classificationMismatch:icon&&meta.resourceType==='other'?'DOCUMENT_ICON_REPORTED_OTHER':asset&&meta.resourceType==='other'?'VERIFIED_STATIC_REPORTED_OTHER':'NONE_PROVEN',
   redirectRelation:meta.redirected===true?'REDIRECT_CHAIN':'NONE_OBSERVED',
   disposition:icon&&actorStageMatch&&request.method==='GET'&&meta.resourceType==='other'&&meta.frameClass==='APPLICATION_MAIN_FRAME'&&meta.redirected!==true?'EXCLUDE_DOCUMENT_ICON_WITHOUT_DISPATCH':'NORMAL_STRICT_GATE',networkDispatchOccurred:false};
  return d;
 }
 references(){return [...this.#icons.values()].map(x=>({...x}))}
}
