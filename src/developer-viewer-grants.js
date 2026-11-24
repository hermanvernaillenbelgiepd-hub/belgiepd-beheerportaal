// Independent, auditable override for the temporary Developer · Inzage profile.
// Explicit OFF always beats the legacy Render allowlist (fail closed).
export const DEVELOPER_VIEWER_COLLECTION='bpd_portal_developer_viewer_grants';
export const DEVELOPER_VIEWER_AUDIT='bpd_portal_developer_viewer_audit';
const ID=/^\d{15,22}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const today=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
const validDay=value=>typeof value==='string'&&DAY.test(value)&&
 Number.isFinite(Date.parse(value+'T12:00:00Z'))&&
 new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
function inherited(id,env){
 const allowed=String(env?.BPD_DEVELOPER_VIEWER_IDS||'').split(',')
  .map(x=>x.trim()).includes(id);
 return allowed&&validDay(env?.BPD_DEVELOPER_VIEWER_UNTIL)?
  env.BPD_DEVELOPER_VIEWER_UNTIL:null;
}
export function developerViewerGrantState(id,raw,env,now=new Date()){
 if(!ID.test(String(id||'')))
  return {enabled:false,status:'invalid',expiresOn:null,revision:0,source:'none'};
 const legacy=inherited(id,env),current=today(now);
 const hasOverride=raw!==null&&typeof raw==='object'&&!Array.isArray(raw);
 if(hasOverride){
  const valid=raw.discordId===id&&typeof raw.enabled==='boolean'&&
   validDay(raw.expiresOn);
  const enabled=valid&&raw.enabled===true&&raw.expiresOn>=current;
  return {enabled,status:!valid?'invalid':!raw.enabled?'disabled':enabled?'active':'expired',
   expiresOn:valid?raw.expiresOn:null,
   revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0,
   source:'managed'};
 }
 return {enabled:legacy!==null&&legacy>=current,
  status:legacy===null?'not_set':legacy>=current?'active':'expired',
  expiresOn:legacy,revision:0,source:legacy===null?'none':'environment'};
}
export function validateDeveloperViewerChange(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).length!==3||
  !['enabled','reason','expectedRevision'].every(key=>Object.hasOwn(body,key))||
  typeof body.enabled!=='boolean'||
  !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
  throw Object.assign(Error('Ongeldige Developer-machtiging of revisie'),{status:400});
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<10||reason.length>240||/[\x00-\x1f\x7f<>]/.test(reason))
  throw Object.assign(Error('Motivering van 10–240 tekens verplicht'),{status:400});
 return {enabled:body.enabled,reason,expectedRevision:body.expectedRevision};
}
export function developerViewerNewExpiry(id,previous,env,now=new Date()){
 const current=today(now);
 if(validDay(previous?.expiresOn)&&previous.expiresOn>=current)
  return previous.expiresOn;
 const envExpiry=inherited(id,env);
 if(envExpiry&&envExpiry>=current)return envExpiry;
 // Default new grants to 30 days; no open-ended developer access.
 const date=new Date(now);date.setUTCDate(date.getUTCDate()+30);
 return today(date);
}
