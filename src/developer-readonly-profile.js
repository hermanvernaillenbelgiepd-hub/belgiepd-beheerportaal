// Infrastructure-signed, temporary, single-purpose presentation reviewer.
// Synthetic technical-shaped actor exists ONLY after verified Discord OAuth
// and a configured allowlist; all non-design state-changing methods are denied.
import {verifiedDiscordIdentity} from './user-access.js';
const ID=/^\d{15,22}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ALL=['politie','brandweer','ambulance','depannage','burger'];
const SESSION_MS=8*3600000;
const belgianDay=now=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(now));
export function developerViewerEligible(decoded,member,account,env,now=Date.now()){
 const id=String(decoded?.uid||'').replace(/^discord:/,'');
 if(!ID.test(id)||decoded?.uid!=='discord:'+id||
  !String(env?.BPD_DEVELOPER_VIEWER_IDS||'').split(',').map(x=>x.trim()).includes(id))
  return false;
 const until=String(env?.BPD_DEVELOPER_VIEWER_UNTIL||'');
 if(!DATE.test(until)||Number.isNaN(Date.parse(until+'T12:00:00Z'))||
  new Date(until+'T12:00:00Z').toISOString().slice(0,10)!==until||
  until<belgianDay(now))return false;
 if(account?.status==='blocked'||account?.status&&
  !['approved','pending'].includes(account.status))return false;
 return verifiedDiscordIdentity(decoded,member,env.DISCORD_GUILD_ID,now,SESSION_MS)===id;
}
export function readOnlyDeveloperActor(uid,id){
 if(uid!=='discord:'+id||!ID.test(id))throw Error('Geen geverifieerde developer-identiteit');
 return {uid,discordId:id,role:'beheerder',departments:[...ALL],
  departmentRoles:Object.fromEntries(ALL.map(x=>[x,'korpsleiding'])),
  portalTechnicalMode:true,profileTechnicalAvailable:true,
  portalDeveloperReadOnly:true,portalDesignOnly:true,
  developerDisplayRole:'Developer · Inzage & Vormgeving'};
}
export function readOnlyDeveloperRequestAllowed(method,path){
 if(method==='GET'||method==='HEAD')return true;
 // Only validated per-page and global appearance updates, NEVER grant changes.
 return method==='PUT'&&(
  path==='/api/visual-design/admin'||
  /^\/api\/visual-design\/pages\/[a-z0-9-]+$/.test(path));
}
