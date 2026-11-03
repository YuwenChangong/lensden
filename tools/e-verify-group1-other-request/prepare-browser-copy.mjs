import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),source=fileURLToPath(new URL('../e-verify-group1-v9-closure/browser.mjs',import.meta.url));
const old=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../e-verify-group1-full650-chrome-v11/artifacts/EXECUTION_BINDING_GROUP1.json',import.meta.url))));
const f=old.files.find(x=>path.resolve(x.path)===path.resolve(source));let code=fs.readFileSync(source,'utf8');if(!f||sha(Buffer.from(code))!==f.sha256)throw new Error('BROWSER_SOURCE_DRIFT');
const changes=[
 ["htmlEvidencePolicy}={})","htmlEvidencePolicy,privateCorrelation}={})"],
 ["from './gate.mjs'","from '../e-verify-group1-v9-closure/gate.mjs'"],
 ["from './cached-read.mjs'","from '../e-verify-group1-v9-closure/cached-read.mjs'"],
 ["from '../e-verify-group1-script-identity/execution/group1/diagnostics.mjs'","from './diagnostics.mjs'"],
 ["const diagnostics=new DiagnosticJournal({actor,appOrigin,supabaseOrigin,staticPaths,readOnlyLoginDiagnostic});","const publicResourceIndex=new ReviewedPublicResources({actor,appOrigin,staticManifest});\n const diagnostics=new DiagnosticJournal({actor,appOrigin,supabaseOrigin,staticPaths,readOnlyLoginDiagnostic,publicResourceIndex,privateCorrelation});"],
 ["if(ticket.kind==='page'&&pageAssertions[new URL(request.url).pathname])pageAssertions[new URL(request.url).pathname](result);","if(ticket.kind==='page'&&pageAssertions[new URL(request.url).pathname])pageAssertions[new URL(request.url).pathname](result);\n   if(ticket.kind==='page')publicResourceIndex.observeValidatedHtml(result.body,request.url);"],
 ["try{\n    if(closingMode)","try{\n    try{const frame=q.frame();diagnosticMeta.frameClass=new URL(frame.url()).origin===appOrigin?(frame===p.mainFrame()?'APPLICATION_MAIN_FRAME':'APPLICATION_CHILD_FRAME'):new URL(frame.url()).origin==='https://challenges.cloudflare.com'?'TURNSTILE_FRAME':'UNAPPROVED_FRAME'}catch{diagnosticMeta.frameClass='NO_FRAME_OR_UNAVAILABLE'}\n    if(closingMode)"],
 ["// Deliberately exclude nonessential images/media/fonts from this Auth/RLS subset.","const publicResourceDecision=publicResourceIndex.observe(diagnosticRequest,diagnosticMeta);\n    if(publicResourceDecision.disposition==='EXCLUDE_DOCUMENT_ICON_WITHOUT_DISPATCH'){diagnostics.excluded(diagnosticRequest,diagnosticMeta);excluded++;await route.abort();return}\n    // Deliberately exclude nonessential images/media/fonts from this Auth/RLS subset."],
];
for(const [before,after] of changes){if(code.split(before).length!==2)throw new Error('BROWSER_PATCH_NOT_EXACT');code=code.replace(before,after)}
code="import {ReviewedPublicResources} from './public-resources.mjs';\n"+code;
fs.writeFileSync(path.join(here,'browser-observed-private.mjs'),code,{flag:'wx'});console.log(JSON.stringify({status:'PASS',sourceSha256:f.sha256,changes:changes.length,strictGateChanged:false,staticManifestChanged:false,productionRequests:0}));
