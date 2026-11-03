export const CREATION_TIME_TOLERANCE_MS=10000;
function zonedTime(value){
 if(typeof value!=='string')return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!m)return null;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)return null;
 if(m[7]!=='Z'){const [h,n]=m[7].slice(1).split(':').map(Number);if(h>14||n>59||(h===14&&n!==0))return null;}
 const ms=Date.parse(value);return Number.isFinite(ms)?{ms,utc:new Date(ms).toISOString()}:null;
}
export function creationRequestWindow(request,response,binding){
 const start=zonedTime(request?.utc),end=zonedTime(response?.utc);
 const verified=typeof binding==='string'&&request?.binding===binding&&response?.binding===binding&&request?.label==='A-create'&&response?.label==='A-create'&&request?.method==='POST'&&request?.endpoint==='/auth/v1/admin/users'&&response?.status===200&&!!start&&!!end&&end.ms>=start.ms&&end.ms-start.ms<=10000;
 return verified?{verified:true,startMs:start.ms,endMs:end.ms,start:start.utc,end:end.utc}:{verified:false};
}
export function creationTimeEvidence(user,window){
 const present=!!user&&Object.hasOwn(user,'created_at'),parsed=present?zonedTime(user.created_at):null;
 const validWindow=window?.verified===true&&Number.isFinite(window.startMs)&&Number.isFinite(window.endMs)&&window.endMs>=window.startMs&&window.endMs-window.startMs<=10000&&zonedTime(window.start)?.ms===window.startMs&&zonedTime(window.end)?.ms===window.endMs;
 const e={
  CREATED_AT_FIELD_PRESENT:present,
  CREATED_AT_PARSE_RESULT:!present?'MISSING':parsed?'VALID_EXPLICIT_TIMEZONE':'INVALID',
  PROVIDER_CREATED_AT_UTC:parsed?.utc??null,
  LOCAL_CREATION_WINDOW_UTC:validWindow?{start:window.start,end:window.end,toleranceMs:CREATION_TIME_TOLERANCE_MS}:null,
  CREATION_TIME_DIFFERENCE_MS:null,
  CREATION_TIME_VALIDATION_RESULT:'UNKNOWN',
  CREATION_TIME_FAILURE_REASON:null,
 };
 if(!validWindow)e.CREATION_TIME_FAILURE_REASON='CREATION_RECEIPT_BOUNDARIES_UNVERIFIED';
 else if(!present)e.CREATION_TIME_FAILURE_REASON='CREATED_AT_MISSING';
 else if(!parsed)e.CREATION_TIME_FAILURE_REASON='CREATED_AT_INVALID_OR_UNZONED';
 else{
  // Signed distance to the request interval; zero means inside, not equal to journal time.
  const delta=parsed.ms<window.startMs?parsed.ms-window.startMs:parsed.ms>window.endMs?parsed.ms-window.endMs:0;
  e.CREATION_TIME_DIFFERENCE_MS=delta;
  e.CREATION_TIME_VALIDATION_RESULT=Math.abs(delta)<=CREATION_TIME_TOLERANCE_MS?'PASS':'FAIL';
  e.CREATION_TIME_FAILURE_REASON=e.CREATION_TIME_VALIDATION_RESULT==='PASS'?null:'OUTSIDE_APPROVED_CREATION_REQUEST_WINDOW';
 }
 return e;
}
