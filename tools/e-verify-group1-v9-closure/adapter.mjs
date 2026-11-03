import {openGroup1Browser} from './browser.mjs';
import {runGroup1} from '../e-verify-group1-script-identity/execution/group1/runner.mjs';
import {VERSION} from './review.mjs';
import {HtmlEvidencePolicy} from './html-policy.mjs';

const stages={A:'LOGIN_A',B:'LOGIN_B',ADMIN:'LOGIN_ADMIN'};
const negatives={'invalid-captcha':'NEGATIVE_CAPTCHA','missing-captcha':'NEGATIVE_MISSING_CAPTCHA','wrong-password':'NEGATIVE_PASSWORD'};
export function makeBrowserFactory({manifest,htmlHashes,reviewedHtmlBodies}){
  if(!Array.isArray(manifest)||manifest.length!==29||manifest.some(a=>a.provenance!=='VERIFIED'||a.version!==VERSION)
    ||new Set(manifest.map(a=>a.path)).size!==29)throw new Error('FULL_STATIC_SCOPE_INVALID');
  const positiveOnly=new Set(manifest.filter(a=>/\/(?:index\.|catalog-compare-dom\.|AdminDevicesDashboard\.|useAdminSession\.|GlassConfirmDialog\.)/.test(a.path)).map(a=>a.path));
  return async options=>{
    let stage=stages[options.actor];
    const transport=(request,bounds)=>{
      const u=new URL(request.url);
      if(positiveOnly.has(u.pathname)&&stage!==stages[options.actor])throw new Error('STATIC_STAGE_ACTOR_MISMATCH');
      return options.transport(request,bounds);
    };
    const browser=await openGroup1Browser({...options,transport,staticManifest:manifest,staticPaths:manifest.map(a=>a.path),productionVersion:VERSION,approvedHtmlHashes:htmlHashes,htmlEvidencePolicy:reviewedHtmlBodies?new HtmlEvidencePolicy(reviewedHtmlBodies):undefined});
    return Object.freeze({...browser,permitLogin:kind=>{stage=kind==='success'?stages[options.actor]:negatives[kind];browser.permitLogin(kind)}});
  };
}
export function runBoundGroup1(options,{manifest,htmlHashes,openBrowser}={}){
  return runGroup1({...options,staticManifest:manifest,openBrowser:openBrowser??makeBrowserFactory({manifest,htmlHashes})});
}
