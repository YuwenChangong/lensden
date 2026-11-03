import {waitForStart}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {chromium}from'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
await waitForStart();
// about:blank only. This child intentionally omits cleanup to test Job Object drain.
await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
 proxy:{server:'http://127.0.0.1:1'},args:['--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND','--proxy-bypass-list=<-loopback>']});
await new Promise(()=>{});
