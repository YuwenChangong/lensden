import {sha} from './semantic.mjs';

const stages={LOGIN_A:'A',LOGIN_B:'B',LOGIN_ADMIN:'ADMIN',NEGATIVE_CAPTCHA:'A',NEGATIVE_MISSING_CAPTCHA:'A',NEGATIVE_PASSWORD:'A'};
const publicPath=/^\/_astro\/[A-Za-z0-9_.-]+\.[A-Za-z0-9_-]{8}\.(js|css)$/;

// Scope metadata is checked before the existing atomic budget gate or wire transport.
export class StaticEvidencePolicy {
 #origin;#version;#assets=new Map();
 constructor({origin,version,assets}){
  const u=new URL(origin);
  if(u.protocol!=='https:'||u.origin!==origin||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(version||'')||!Array.isArray(assets)||!assets.length)throw new Error('STATIC_POLICY_INVALID');
  this.#origin=origin;this.#version=version;
  for(const a of assets){
   if(!publicPath.test(a.path)||this.#assets.has(a.path)||a.version!==version||a.provenance!=='VERIFIED'||!['script','stylesheet'].includes(a.kind)
    ||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>2097152||!/^[a-f0-9]{64}$/.test(a.sha256)
    ||(a.kind==='script')!==a.path.endsWith('.js'))throw new Error('STATIC_POLICY_INVALID');
   this.#assets.set(a.path,Object.freeze({...a}));
  }
 }
 assertRequest(q,meta,currentVersion){
  if(currentVersion!==this.#version)throw new Error('STATIC_VERSION_MISMATCH');
  let u;try{u=new URL(q.url)}catch{throw new Error('STATIC_BINDING_MISMATCH')}
  if(u.origin!==this.#origin||u.search||u.hash||u.username||u.password||q.method!=='GET')throw new Error('STATIC_BINDING_MISMATCH');
  if(!Object.hasOwn(stages,meta.stage)||stages[meta.stage]!==q.actor)throw new Error('STATIC_STAGE_ACTOR_MISMATCH');
  const a=this.#assets.get(u.pathname);
  if(!a||meta.resourceType!==a.kind)throw new Error('STATIC_BINDING_MISMATCH');
  return a;
 }
 assertBody(path,body){
  const a=this.#assets.get(path);
  if(!a||!Buffer.isBuffer(body)||body.length!==a.bytes||sha(body)!==a.sha256)throw new Error('STATIC_SOURCE_MISMATCH');
  return true;
 }
}
