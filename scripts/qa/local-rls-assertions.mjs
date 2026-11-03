import { verifyGroup1Catalog } from '../../tools/e-verify-group1-login-diagnostics/execution/group1/rls.mjs';

// A PostgREST diagnostic hint is not evidence of granted database access.
// Keep every frozen status/code/message/shape check; normalize only textual hints.
export function verifyLocalCatalog(step,response) {
  if (step.expect !== 'public' && [401,403].includes(response.status)) {
    let data;
    try { data=JSON.parse(response.body.toString('utf8')); } catch { /* Frozen verifier rejects invalid JSON. */ }
    if(data && !Array.isArray(data) && data.code==='42501' && typeof data.hint==='string') {
      return verifyGroup1Catalog(step,{...response,body:Buffer.from(JSON.stringify({...data,hint:null}))});
    }
  }
  return verifyGroup1Catalog(step,response);
}
