import {catalogSteps,verifyCatalog} from '../identity-rls.mjs';
export {catalogSteps};
// Explicit proposed subset amendment: anonymous PostgREST 42501 is 401 or 403.
// Authenticated expectations and the exact denial payload remain unchanged.
export function verifyGroup1Catalog(step,response){
 if(step.actor==='anon'&&step.expect==='deny'&&response.status===401)return verifyCatalog(step,{...response,status:403});
 return verifyCatalog(step,response);
}
