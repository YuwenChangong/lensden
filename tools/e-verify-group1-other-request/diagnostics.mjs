import {DiagnosticJournal as OriginalJournal} from '../e-verify-group1-script-identity/execution/group1/diagnostics.mjs';
export class DiagnosticJournal{
 #original;#index;#observations=[];#firstRejected=null;#excluded=0;#correlate;
 constructor(options){this.#original=new OriginalJournal(options);this.#index=options.publicResourceIndex;this.#correlate=options.privateCorrelation}
 observeLoginHtml(...a){return this.#original.observeLoginHtml(...a)}
 observeBoundScript(...a){return this.#original.observeBoundScript(...a)}
 #observe(q,m){const d=this.#index.observe(q,m);if(this.#observations.length<32)this.#observations.push(d);return d}
 #rejectedContext(q,d){if(this.#firstRejected)return;if(d.resourceType==='other'&&!d.htmlReferenceMatch&&this.#correlate){try{const c=this.#correlate.capture(q,d);d.privateCorrelation={status:c.status,...(c.status==='ENCRYPTED_PATH_ONLY'?{evidenceRef:c.evidenceRef,ciphertextSha256:c.ciphertextSha256}:{})}}catch{d.privateCorrelation={status:'CAPTURE_FAILED'}}}this.#firstRejected=d}
 reserve(gate,q,m){const d=this.#observe(q,m);try{return this.#original.reserve(gate,q,m)}catch(e){this.#rejectedContext(q,d);throw e}}
 rejectBrowser(gate,q,m,code){this.#rejectedContext(q,this.#observe(q,m));return this.#original.rejectBrowser(gate,q,m,code)}
 excluded(q,m){const d=this.#observe(q,m);if(d.disposition!=='EXCLUDE_DOCUMENT_ICON_WITHOUT_DISPATCH')throw new Error('ICON_EXCLUSION_NOT_APPROVED');this.#excluded++}
 dispatchStarted(...a){return this.#original.dispatchStarted(...a)}
 completed(...a){return this.#original.completed(...a)}
 failed(...a){return this.#original.failed(...a)}
 receipt(){return {...this.#original.receipt(),preDispatchContext:{firstRejected:this.#firstRejected,observations:this.#observations,excludedDocumentIcons:this.#excluded},privacyBoundary:'NO_URL_QUERY_HEADER_BODY_SESSION_OR_FRAME_URL_RECORDED'}}
}
