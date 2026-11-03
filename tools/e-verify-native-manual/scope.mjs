export const ORIGIN='https://challenges.cloudflare.com';
export const SDK=ORIGIN+'/turnstile/v0/api.js?render=explicit';
export const TEST_SITEKEY='1x00000000000000000000AA';
export class NativeScope{
 #local;#vendor;#sdk;#frames=new Set();#begun=false;#opened=false;#requests=new Set();
 constructor(local,{fixtureOrigin}={}){const u=new URL(local);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.origin!==local)throw new Error('LOOPBACK_REQUIRED');this.#local=local;this.#vendor=ORIGIN;this.#sdk=SDK;
  if(fixtureOrigin){const f=new URL(fixtureOrigin);if(f.protocol!=='http:'||f.hostname!=='127.0.0.1'||!f.port||f.origin!==fixtureOrigin)throw new Error('FIXTURE_LOOPBACK_REQUIRED');this.#vendor=fixtureOrigin;this.#sdk=fixtureOrigin+'/fixture/sdk.js'}
 }
 register(frame,parent){if(frame==='main'&&parent===null){this.#frames.add(frame);return}if(!this.#frames.has(parent))throw new Error('FRAME_NOT_REGISTERED');this.#frames.add(frame)}
 classify(url){try{const u=new URL(url);return u.origin===this.#local?'LOCAL_HARNESS':u.origin===this.#vendor?'OFFICIAL_VENDOR':'UNAPPROVED_ORIGIN'}catch{return'INVALID_URL'}}
 admit(q){
  const u=new URL(q.url);if(u.username||u.password||u.hash||/[\x00-\x20\\]/.test(u.href)||u.href.length>8192)throw new Error('REQUEST_ENVELOPE_FORBIDDEN');
  if(!this.#frames.has(q.frame))throw new Error('FRAME_NOT_REGISTERED');
  if(q.url===this.#local+'/turnstile-native-qa'&&q.method==='GET'&&q.type==='Document'&&q.frame==='main'){if(this.#opened)throw new Error('HARNESS_RELOAD_FORBIDDEN');this.#opened=true;return'LOCAL_HARNESS'}
  if(u.origin!==this.#vendor)throw new Error('ORIGIN_FORBIDDEN');
  let pathname;try{pathname=decodeURIComponent(u.pathname)}catch{throw new Error('PATH_ENCODING_INVALID')}
  if(pathname==='/turnstile/v0/siteverify')throw new Error('SITEVERIFY_FORBIDDEN');
  if(Object.keys(q.headers||{}).some(k=>['authorization','proxy-authorization','apikey'].includes(k.toLowerCase())))throw new Error('CREDENTIAL_HEADER_FORBIDDEN');
  if(!['GET','POST'].includes(q.method)||!['Script','Document','Stylesheet','Image','Font','Fetch','XHR'].includes(q.type)||q.method==='POST'&&!['Fetch','XHR'].includes(q.type))throw new Error('METHOD_OR_TYPE_FORBIDDEN');
  if(q.frame==='main'&&q.type==='Document')throw new Error('MAIN_NAVIGATION_FORBIDDEN');
  if(!this.#begun){if(q.url!==this.#sdk||q.method!=='GET'||q.type!=='Script'||q.frame!=='main')throw new Error('EXACT_BOOTSTRAP_REQUIRED');this.#begun=true;if(q.id)this.#requests.add(q.id);return'OFFICIAL_SDK'}
  if(q.redirectedFrom){if(!this.#requests.has(q.redirectedFrom))throw new Error('REDIRECT_CHAIN_UNPROVEN');if(q.id)this.#requests.add(q.id);return'NATIVE_VENDOR_REDIRECT'}
  if(q.url===this.#sdk)throw new Error('SDK_BOOTSTRAP_REPLAY');
  if(q.id)this.#requests.add(q.id);return'VENDOR_WIDGET_FLOW';
 }
}
