import {createRequire} from 'node:module';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
const {parse,serialize}=req('parse5');
const fail=()=>{throw new Error('HTML_SOURCE_MISMATCH')};
export function normalizedHtmlHash(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>2097152)fail();
  const tree=parse(bytes.toString('utf8')),stack=[tree];
  while(stack.length){const n=stack.pop();
    if(n.tagName==='astro-island'){
      const props=n.attrs?.find(a=>a.name==='props');
      if(props){let p;try{p=JSON.parse(props.value)}catch{fail()}
        // Only source-defined, serialized locale metadata may change after adoption.
        // Locale/preference/text/code/URLs and every other prop remain byte-structural.
        for(const key of ['localeContext','initial'])if(p[key]){
          const tagged=p[key],c=tagged?.[1];
          if(tagged[0]!==0||!c||typeof c!=='object'||Array.isArray(c))fail();
          const expected=['locale','preference','source','autoLocale','generation','provenance'];
          if(Object.keys(c).sort().join('|')!==expected.sort().join('|')||Object.values(c).some(v=>!Array.isArray(v)||v.length!==2||v[0]!==0)
            ||!['zh-CN','en'].includes(c.locale[1])||!['auto','zh-CN','en'].includes(c.preference[1])||!['zh-CN','en'].includes(c.autoLocale[1])
            ||!['current','saved','country','accept_language','fallback'].includes(c.source[1])||!Number.isSafeInteger(c.generation[1])||c.generation[1]<0
            ||![null,'device_explicit','account_adopted'].includes(c.provenance[1]))fail();
          c.generation=[0,0];c.provenance=[0,null];c.source=[0,'fallback'];
        }
        props.value=JSON.stringify(p);
      }
    }
    stack.push(...(n.childNodes||[]));
  }
  return sha(Buffer.from(serialize(tree)));
}
export class HtmlEvidencePolicy{
  #hashes;
  constructor(reviewedBodies){this.#hashes=new Map([...reviewedBodies].map(([p,bodies])=>[p,new Set((Array.isArray(bodies)?bodies:[bodies]).map(normalizedHtmlHash))]))}
  assertBody(route,body){if(!this.#hashes.get(route)?.has(normalizedHtmlHash(body)))fail();return true}
}
