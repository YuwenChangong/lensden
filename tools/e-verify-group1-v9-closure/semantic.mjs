import {sha,canonicalModule,compareModules} from '../e-verify-group1-production-binding/semantic.mjs';

// Only this captured/frozen pair: identical imports/AST, different sibling import order.
// React/jsx-runtime/react-dom are reviewed lazy runtime factories; useLocale's lazy
// catalog initialization does not consume the dialog module during import evaluation.
export function compareNewModule(actual,local,actualPath,localPath,known){
  if(actualPath!=='/_astro/GlassConfirmDialog.D2bRRp6P.js')return compareModules(actual,local,actualPath,localPath,known);
  if(localPath!=='/_astro/GlassConfirmDialog.BkjmaYBn.js'
    ||sha(actual)!=='75b21ce18323d35e842aad13673ae8c0b61dca7096c4185c383c8415aee8d84a'
    ||sha(local)!=='206a8064062d48bc7184af1b4ee55dae85a5fa2aae18339e4288aff012a32771')throw new Error('DIALOG_REVIEW_PAIR_CHANGED');
  const a=canonicalModule(actual,actualPath,known,{reviewedImportOrder:true}),b=canonicalModule(local,localPath,known,{reviewedImportOrder:true});
  return {matches:a.canonicalSha256===b.canonicalSha256&&JSON.stringify(a.importSet)===JSON.stringify(b.importSet),
    kind:'EXACT_PINNED_DIALOG_IMPORT_ORDER_REVIEW',canonicalSha256:a.canonicalSha256};
}
