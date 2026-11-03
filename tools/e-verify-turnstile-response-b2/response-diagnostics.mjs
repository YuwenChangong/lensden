const ALLOWED='https://challenges.cloudflare.com';
const BASE=ALLOWED+'/turnstile/v0/api.js?render=explicit';
const safeCode=code=>/^[A-Z0-9_]{1,64}$/.test(code)?code:'RESPONSE_FAILURE';
const normalized=h=>Object.fromEntries(Object.entries(h||{}).map(([k,v])=>[k.toLowerCase(),v]));
const empty=sequence=>({sequence,HTTP_STATUS_CODE:null,HTTP_STATUS_CLASS:'UNKNOWN',RESPONSE_HEADERS_OBSERVED:false,
 LOCATION_HEADER_PRESENT:null,LOCATION_TARGET_ORIGIN_CLASS:'UNKNOWN',LOCATION_TARGET_SAME_ALLOWED_HOST:null,
 REDIRECT_STATUS_TRIGGERED:null,LOCATION_HEADER_TRIGGERED:null,SDK_RESPONSE_REJECTION_REASON:null});
export function validSafeResponse(r){
 if(!r||Object.keys(r).sort().join('|')!==Object.keys(empty(1)).sort().join('|'))return false;
 const nullableBool=x=>x===null||typeof x==='boolean';
 return Number.isSafeInteger(r.sequence)&&r.sequence>0&&r.sequence<=40&&
  (r.HTTP_STATUS_CODE===null||Number.isInteger(r.HTTP_STATUS_CODE)&&r.HTTP_STATUS_CODE>=100&&r.HTTP_STATUS_CODE<=599)&&
  r.HTTP_STATUS_CLASS===(r.HTTP_STATUS_CODE===null?'UNKNOWN':Math.floor(r.HTTP_STATUS_CODE/100)+'xx')&&typeof r.RESPONSE_HEADERS_OBSERVED==='boolean'&&
  ['LOCATION_HEADER_PRESENT','LOCATION_TARGET_SAME_ALLOWED_HOST','REDIRECT_STATUS_TRIGGERED','LOCATION_HEADER_TRIGGERED'].every(k=>nullableBool(r[k]))&&
  ['UNKNOWN','NOT_PRESENT','EMPTY_OR_INVALID','CREDENTIAL_BEARING','NON_HTTPS_ORIGIN','SAME_ALLOWED_ORIGIN','OTHER_HTTPS_ORIGIN'].includes(r.LOCATION_TARGET_ORIGIN_CLASS)&&
  (r.SDK_RESPONSE_REJECTION_REASON===null||typeof r.SDK_RESPONSE_REJECTION_REASON==='string'&&/^[A-Z0-9_]{1,64}$/.test(r.SDK_RESPONSE_REJECTION_REASON));
}
export class ResponseJournal{
 #items=new Map();
 start(id){if(this.#items.has(id)||this.#items.size>=40)throw new Error('RESPONSE_OBSERVATION_ID');this.#items.set(id,empty(id))}
 headers(id,r){
  const item=this.#items.get(id);if(!item)throw new Error('RESPONSE_OBSERVATION_ID');
  const status=Number.isInteger(r?.status)&&r.status>=100&&r.status<=599?r.status:null,h=normalized(r?.headers);
  const present=Object.hasOwn(h,'location');let klass=present?'EMPTY_OR_INVALID':'NOT_PRESENT',same=null;
  if(present&&typeof h.location==='string'&&h.location.trim()&&h.location.length<=8192&&!/[\x00-\x20\\]/.test(h.location)){
   try{const u=new URL(h.location,BASE);same=u.origin===ALLOWED;
    if(u.username||u.password){klass='CREDENTIAL_BEARING';same=false}
    else if(u.protocol!=='https:'){klass='NON_HTTPS_ORIGIN';same=false}
    else klass=same?'SAME_ALLOWED_ORIGIN':'OTHER_HTTPS_ORIGIN';
   }catch{same=null}
  }
  Object.assign(item,{HTTP_STATUS_CODE:status,HTTP_STATUS_CLASS:status?Math.floor(status/100)+'xx':'UNKNOWN',RESPONSE_HEADERS_OBSERVED:true,
   LOCATION_HEADER_PRESENT:present,LOCATION_TARGET_ORIGIN_CLASS:klass,LOCATION_TARGET_SAME_ALLOWED_HOST:same,
   REDIRECT_STATUS_TRIGGERED:status===null?null:status>=300&&status<400,LOCATION_HEADER_TRIGGERED:present});
 }
 fail(id,code){const item=this.#items.get(id);if(!item)throw new Error('RESPONSE_OBSERVATION_ID');item.SDK_RESPONSE_REJECTION_REASON??=safeCode(code)}
 receipt(){return[...this.#items.values()].map(x=>({...x}))}
}
