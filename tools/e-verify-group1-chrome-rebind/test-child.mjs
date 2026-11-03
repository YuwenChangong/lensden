import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {waitForStart} from '../e-verify-group1-remaining-assets/supervisor.mjs';
import {chromium} from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import {fullFlowFixture} from './fixture-rebound.mjs';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
await waitForStart();
const out=path.resolve(process.argv[2]),mode=process.argv[3];
if(!out.includes('ogh-chrome-identity-')||!['smoke','wrong-identity','forbidden','budget','deadline'].includes(mode))throw new Error('TEST_SCOPE');
const expected='C:/Program Files/Google/Chrome/Application/chrome.exe';
const identity=JSON.parse(fs.readFileSync(new URL('./artifacts/CHROME_IDENTITY_LOCAL_SAFE.json',import.meta.url)));
if(sha(fs.readFileSync(expected))!==identity.sha256)throw new Error('CHROME_CHANGED_BEFORE_TEST');
const originalLaunch=chromium.launch.bind(chromium),launches=[];
chromium.launch=async options=>{
 let browser,stage='LAUNCH';
 try{
 if(path.resolve(options.executablePath).toLowerCase()!==path.resolve(expected).toLowerCase())throw new Error('BROWSER_PATH_MISMATCH');
 browser=await originalLaunch(options);stage='CDP_SESSION';
 const session=await browser.newBrowserCDPSession();
 stage='PROCESS_INFO';const info=await session.send('SystemInfo.getProcessInfo');
 const pid=Number(info.processInfo.find(p=>p.type==='browser')?.id);
 if(!Number.isSafeInteger(pid)||pid<=0)throw new Error('BROWSER_PID_NOT_OBSERVED');
 stage='OS_IMAGE';const image=JSON.parse(execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; [pscustomobject]@{path=$p.ExecutablePath;pid=$p.ProcessId;command=$p.CommandLine}|ConvertTo-Json -Compress`],{windowsHide:true,encoding:'utf8',timeout:15000}));
 if(path.resolve(image.path).toLowerCase()!==path.resolve(expected).toLowerCase()||browser.version()!==identity.version)throw new Error('ACTUAL_BROWSER_IDENTITY_MISMATCH');
 const profile=/--user-data-dir=(?:"([^"]+)"|([^\s]+))/.exec(image.command)?.slice(1).find(Boolean);
 if(!profile||!profile.includes('playwright_chromiumdev_profile-'))throw new Error('BROWSER_PROFILE_NOT_ISOLATED');
 const required=['--disable-background-networking','--disable-component-update','--disable-sync','--disable-quic','--no-first-run','--no-default-browser-check','--disable-domain-reliability','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--proxy-bypass-list=<-loopback>','--disable-features=WebTransport'];
 if(!required.every(a=>options.args.includes(a))||!/^http:\/\/127\.0\.0\.1:\d+$/.test(options.proxy.server))throw new Error('BROWSER_NETWORK_OPTIONS_CHANGED');
 const record={actualPath:image.path,version:browser.version(),pid,profileFingerprint:sha(profile),requiredFlagsPresent:true,denyProxyLoopback:true,isolatedProfile:true,contextOptionsValid:false};launches.push(record);
 const originalNew=browser.newContext.bind(browser);browser.newContext=async opts=>{if(opts.serviceWorkers!=='block'||opts.acceptDownloads!==false)throw new Error('CONTEXT_OPTIONS_CHANGED');record.contextOptionsValid=true;return originalNew(opts)};
 await session.detach();return browser;
 }catch(e){try{await browser?.close()}catch{}throw new Error(/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'BROWSER_PROBE_'+stage)}
};
process.env.CHROME_TEST_MODE=mode;
try{
 const result=await fullFlowFixture({wrongIdentity:mode==='wrong-identity',refresh:mode==='smoke',onBrowserReady:async n=>{if(n===1&&mode==='deadline'){if(process.connected)process.send({type:'phase',phase:'started'});await new Promise(()=>{})}}});
 if(sha(fs.readFileSync(expected))!==identity.sha256)throw new Error('CHROME_CHANGED_DURING_TEST');
 const safe={...result,actualBrowserLaunches:launches,browserExecutableVerified:launches.length===3&&launches.every(l=>l.actualPath.toLowerCase()===expected.replaceAll('/','\\').toLowerCase()),profileIsolationVerified:new Set(launches.map(l=>l.profileFingerprint)).size===launches.length};
 const text=JSON.stringify(safe);if(/SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|SYNTHETIC_ONLY|qa-[ab]@|00000000-0000/.test(text))throw new Error('TEST_RECEIPT_SECRET_LEAK');
 fs.writeFileSync(out,text+'\n',{flag:'wx'});
 if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r));
}catch(e){if(!fs.existsSync(out))fs.writeFileSync(out,JSON.stringify({status:'BLOCKED',firstFailure:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'OFFLINE_CHILD_FAILURE',productionRequests:0,productionWrites:0})+'\n',{flag:'wx'});process.exitCode=1}finally{if(process.connected)process.disconnect()}
