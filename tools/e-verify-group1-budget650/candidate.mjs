export const CURRENT=500,PROPOSED=650;
export function candidateCaps(owner){
 if(owner?.allBrowserHttpDispatchesMax!==CURRENT||owner.openaiAndProviderCostUSDMax!==0)throw new Error('OWNER_BUDGET_BASELINE_CHANGED');
 return {...owner,allBrowserHttpDispatchesMax:PROPOSED};
}
export function scopeDifference(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>a[k]!==b[k]).sort()}
