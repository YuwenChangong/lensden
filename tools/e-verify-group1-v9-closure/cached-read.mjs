const paths=new Set(['/api/users/me/summary','/api/users/me/preferences','/api/users/me/notifications?limit=8&unread_only=1']);
const headers=new Set(['accept','accept-language','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform','user-agent','upgrade-insecure-requests','referer','origin','content-type','authorization','apikey','x-client-info','x-supabase-api-version','cache-control','pragma','priority','sec-fetch-site','sec-fetch-mode','sec-fetch-dest','cookie']);
export function ownedReadKey(request,origin,session){
  const u=new URL(request.url),h=Object.fromEntries(Object.entries(request.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  if(u.origin!==origin||u.username||u.password||u.hash||request.method!=='GET'||request.body?.length||!paths.has(u.pathname+u.search)
    ||h.authorization!==session.authorization||h.apikey||Object.keys(h).some(k=>!headers.has(k)))throw new Error('CACHED_READ_SCOPE');
  if(h.cookie){
    const match=/^ogh_preferences_v1=([^;]+)$/.exec(h.cookie);let c;
    try{if(!match||match[1].length>512)throw 0;c=JSON.parse(decodeURIComponent(match[1]))}catch{throw new Error('COOKIE_SCOPE')}
    if(!c||Object.keys(c).sort().join('|')!==['version','preference','generation','provenance'].sort().join('|')||c.version!==1
      ||!['auto','zh-CN','en'].includes(c.preference)||!Number.isSafeInteger(c.generation)||c.generation<0||!['device_explicit','account_adopted'].includes(c.provenance))throw new Error('COOKIE_SCOPE');
  }
  return JSON.stringify([request.url,h.authorization]);
}
export const isOwnedRead=(url,origin)=>{const u=new URL(url);return u.origin===origin&&paths.has(u.pathname+u.search)};
