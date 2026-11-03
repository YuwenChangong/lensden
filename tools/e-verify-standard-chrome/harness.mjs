import { SDK, TEST_SITEKEY } from '../e-verify-native-manual/scope.mjs';
export function harness({ nonce, fixtureOrigin } = {}) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw Error('NONCE_REQUIRED');
  let vendor = 'https://challenges.cloudflare.com', sdk = SDK;
  if (fixtureOrigin) {
    const u = new URL(fixtureOrigin);
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.origin !== fixtureOrigin) throw Error('FIXTURE_LOOPBACK_REQUIRED');
    vendor = fixtureOrigin; sdk = vendor + '/fixture/sdk.js';
  }
  return { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' ${vendor}; frame-src ${vendor}; connect-src ${vendor}; img-src data: ${vendor}; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; frame-ancestors 'none'` },
  body: Buffer.from(`<!doctype html><meta charset="utf-8"><title>Standard Chrome Isolated Turnstile QA</title><link rel="icon" href="data:,">
<button id="start">Start</button><div id="widget"></div><output id="state">READY</output>
<button id="visible">Widget visible</button><button id="interacted">Interaction observed</button><button id="not-required">No interaction required</button><button id="finish">Finish</button><button id="abort">Stop</button>
<script nonce="${nonce}">
let started=false;
const report=name=>{document.getElementById('state').textContent=name;return window.qaEvent(name)};
document.addEventListener('securitypolicyviolation',()=>report('CSP_BLOCKED'));
for(const[id,name]of Object.entries({visible:'HUMAN_WIDGET_VISIBLE',interacted:'HUMAN_INTERACTION_OBSERVED','not-required':'HUMAN_NO_INTERACTION_REQUIRED',finish:'HUMAN_FINISH',abort:'HUMAN_ABORT'}))document.getElementById(id).onclick=()=>report(name);
document.getElementById('start').onclick=async()=>{
 if(started)return;started=true;document.getElementById('start').disabled=true;await report('START_CLICKED');
 const s=document.createElement('script');s.src=${JSON.stringify(sdk)};s.nonce=${JSON.stringify(nonce)};
 s.onload=async()=>{try{await report('SDK_LOADED');await report('RENDER_STARTED');window.turnstile.render('#widget',{sitekey:${JSON.stringify(TEST_SITEKEY)},'response-field':false,retry:'never','refresh-expired':'never','refresh-timeout':'never',callback:()=>report('CALLBACK'),'error-callback':()=>report('WIDGET_ERROR'),'expired-callback':()=>report('EXPIRED')});await report('RENDER_RETURNED')}catch{await report('WIDGET_ERROR')}};
 s.onerror=()=>report('SDK_ERROR');document.head.append(s);
};
</script>`) };
}
