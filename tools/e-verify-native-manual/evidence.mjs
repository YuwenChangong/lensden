import {ORIGIN,SDK}from'./scope.mjs';
const events=new Set(['SDK_LOADED','SDK_ERROR','RENDER_STARTED','RENDER_RETURNED','CALLBACK','WIDGET_ERROR','EXPIRED','CSP_BLOCKED','HUMAN_WIDGET_VISIBLE','HUMAN_INTERACTION_OBSERVED','HUMAN_NO_INTERACTION_REQUIRED','HUMAN_FINISH','HUMAN_ABORT']);
export class Evidence{
 #limit;#vendor;#requests=0;#vendorRequests=0;#redirects=0;#errors=0;#frames=0;#statuses=[];#failure=null;#finish=false;#cleanup='NOT_RUN';#visible=null;#interaction=null;
 #stages={sdkLoaded:false,renderStarted:false,renderReturned:false,callback:false};
 constructor({softObservedStop=40,fixtureOrigin}={}){if(!Number.isSafeInteger(softObservedStop)||softObservedStop<1||softObservedStop>40)throw new Error('INVALID_SOFT_STOP');this.#limit=softObservedStop;this.#vendor=fixtureOrigin||ORIGIN}
 request(q){this.#requests++;try{if(new URL(q.url).origin===this.#vendor)this.#vendorRequests++}catch{}if(this.#vendorRequests>=this.#limit||this.#requests>=650)this.stop('OBSERVED_REQUEST_SOFT_STOP')}
 response(r){try{if(new URL(r.url).origin===this.#vendor&&Number.isInteger(r.status)&&r.status>=100&&r.status<600){if(this.#statuses.length<64)this.#statuses.push(r.status);if(r.status>=300&&r.status<400)this.#redirects++}}catch{}}
 error(){this.#errors++}
 frame(){this.#frames++}
 stop(code){this.#failure??=/^[A-Z0-9_]{1,64}$/.test(code)?code:'BOUNDARY_FAILURE'}
 event(name){if(!events.has(name)){this.stop('STATUS_EVENT_INVALID');return}const map={SDK_LOADED:'sdkLoaded',RENDER_STARTED:'renderStarted',RENDER_RETURNED:'renderReturned',CALLBACK:'callback'};
  if(map[name])this.#stages[map[name]]=true;
  else if(['SDK_ERROR','WIDGET_ERROR','EXPIRED','CSP_BLOCKED','HUMAN_ABORT'].includes(name))this.stop(name);
  else if(name==='HUMAN_WIDGET_VISIBLE')this.#visible=true;
  else if(name==='HUMAN_INTERACTION_OBSERVED')this.#interaction='OBSERVED_BY_OWNER';
  else if(name==='HUMAN_NO_INTERACTION_REQUIRED')this.#interaction='NOT_REQUIRED_BY_TEST_WIDGET';
  else if(name==='HUMAN_FINISH')this.#finish=true;
 }
 cleaned(ok){this.#cleanup=ok?'PASS':'FAILED';if(!ok)this.stop('CLEANUP_FAILED')}
 receipt(){const complete=this.#cleanup==='PASS'&&this.#finish&&Object.values(this.#stages).every(Boolean)&&this.#frames>0&&this.#visible===true&&this.#interaction!==null;
  return{format:'native-turnstile-manual-safe-v1',outcome:this.#failure?'BLOCKED':complete?'ISOLATED_OBSERVATION_COMPLETE':'INCOMPLETE',stopReason:this.#failure,
   stageResults:{...this.#stages},observedFrames:this.#frames,widgetVisibleOwnerAttested:this.#visible,humanInteraction:this.#interaction,ownerFinished:this.#finish,
   cleanupStatus:this.#cleanup,observedTargetRequests:this.#requests,observedVendorRequests:this.#vendorRequests,observedVendorRedirects:this.#redirects,
   vendorResponseStatusCodes:[...this.#statuses],pageErrorCount:this.#errors,networkBoundary:'PARTIAL_TARGET_INTERCEPTION_NOT_ALL_BROWSER_EGRESS',
   softObservedStop:this.#limit,oldHardCapsInherited:false,unobservedBrowserOrOsTraffic:'UNKNOWN',productionEquivalent:false,
   credentialsUsed:false,rawTokensOrUrlsPersisted:false,fullGroup1Authorized:false};
 }
}
