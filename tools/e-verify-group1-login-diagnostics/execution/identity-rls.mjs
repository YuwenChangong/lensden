const base='/rest/v1/';
const paths={legacy:'devices?select=full_specs,key_specs&slug=eq.xreal-air&limit=1',
  specs:'public_device_detail_specs?select=device_slug,key,state&device_slug=eq.xreal-air&limit=2',
  sources:'public_device_detail_sources?select=device_slug,publisher&device_slug=eq.xreal-air&limit=2',
  evidence:'public_device_detail_evidence?select=device_slug,key&device_slug=eq.xreal-air&limit=2',
  audit:'catalog_audit_events?select=id&limit=1'};
export function catalogSteps(){
  const result=[{id:'RLS_ANON_PUBLIC',actor:'anon',path:base+'devices?select=slug,brand_key,name,catalog_normalized&slug=eq.xreal-air&publication_status=eq.published&limit=1',kind:'published',expect:'public'}];
  for(const actor of ['anon','A','B'])for(const [kind,path]of Object.entries(paths))result.push({id:'RLS_'+actor.toUpperCase()+'_'+kind.toUpperCase(),actor,path:base+path,kind,
    expect:actor==='anon'?(['legacy','audit'].includes(kind)?'deny':'public'):['legacy','audit'].includes(kind)?'empty-or-deny':'deny'});
  return result;
}
function parse(r){try{return JSON.parse(r.body.toString('utf8'))}catch{throw new Error('JSON_INVALID')}}
export function verifyIdentity(auth,profile,binding){
  const u=parse(auth);
  if(auth.status!==200||u.id!==binding.userId||typeof u.email!=='string'||u.email.toLowerCase()!==binding.email.toLowerCase())throw new Error('IDENTITY_INVALID');
  const p=parse(profile);
  if(profile.status!==200||!Array.isArray(p)||p.length!==1||p[0].id!==binding.userId||p[0].role!==binding.applicationRole)throw new Error('ROLE_INVALID');
  return true;
}
export function identitySteps(binding,actor){
  if(!['A','B','ADMIN'].includes(actor)||!/^[a-f0-9-]{36}$/i.test(binding.userId))throw new Error('IDENTITY_BINDING_INVALID');
  return [{id:actor+'_USER',actor,path:'/auth/v1/user',categories:['auth']},
    {id:actor+'_PROFILE',actor,path:'/rest/v1/profiles?select=id,role&id=eq.'+binding.userId+'&limit=1',categories:['restRead']}];
}
export function verifyCatalog(step,response){
  const data=parse(response);
  const relation={legacy:'devices',audit:'catalog_audit_events',specs:'public_device_detail_specs',sources:'public_device_detail_sources',evidence:'public_device_detail_evidence'}[step.kind];
  const denialMessages=['permission denied',`permission denied for table ${relation}`,`permission denied for view ${relation}`];
  const deny=response.status===403&&data&&!Array.isArray(data)&&data.code==='42501'&&typeof data.message==='string'&&
    Object.keys(data).every(k=>['code','message','details','hint'].includes(k))&&denialMessages.includes(data.message)&&
    (data.details===undefined||data.details===null)&&(data.hint===undefined||data.hint===null);
  if(step.expect==='deny'&&deny)return true;
  if(step.expect==='empty-or-deny'&&(deny||(response.status===200&&Array.isArray(data)&&data.length===0)))return true;
  if(step.expect!=='public'||response.status!==200||!Array.isArray(data))throw new Error('RLS_ASSERTION_FAILED');
  const columns={published:['slug','brand_key','name','catalog_normalized'],specs:['device_slug','key','state'],sources:['device_slug','publisher'],evidence:['device_slug','key']}[step.kind];
  if(!columns||data.length>(step.kind==='published'?1:2)||(!data.length&&step.kind!=='evidence'))throw new Error('RLS_ASSERTION_FAILED');
  for(const row of data){
    if(!row||typeof row!=='object'||Object.keys(row).length!==columns.length||columns.some(k=>!Object.hasOwn(row,k)))throw new Error('RLS_ASSERTION_FAILED');
    if(step.kind==='published'){
      if(row.slug!=='xreal-air'||row.catalog_normalized!==true||typeof row.brand_key!=='string'||typeof row.name!=='string')throw new Error('RLS_ASSERTION_FAILED');
    }else{
      if(row.device_slug!=='xreal-air'||(step.kind==='specs'&&!['KNOWN','NOT_DISCLOSED','NOT_APPLICABLE','CONFLICT'].includes(row.state)))throw new Error('RLS_ASSERTION_FAILED');
    }
  }
  return true;
}
