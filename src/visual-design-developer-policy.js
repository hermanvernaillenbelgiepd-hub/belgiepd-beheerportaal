// Developer · Vormgeving is a verified single-purpose capability, not a staff role.
import {approvedManagedEntry} from './user-access.js';
import {isActiveVisualDesignGrant} from './visual-design-grants.js';
const ID=/^\d{15,22}$/;
export function isDesignOnlyApiPath(path){
 return typeof path==='string'&&
  /^\/api\/visual-design\/(?:admin|pages\/(?:catalog|[a-z0-9-]+(?:\/history)?))$/.test(path);
}
export function mayIssueDeveloperDesignGrant(id,account,proof,guildId,now=Date.now()){
 if(!ID.test(String(id||''))||!ID.test(String(guildId||''))||
  (account?.status&&!['pending','approved'].includes(account.status)))return false;
 if(approvedManagedEntry(account,id))return true;
 return Boolean(proof&&proof.guildId===guildId&&
  Number.isSafeInteger(proof.verifiedAt)&&proof.verifiedAt<=now&&
  now-proof.verifiedAt<=7*86400000&&Array.isArray(proof.roleIds)&&
  proof.roleIds.length<=500&&proof.roleIds.every(x=>ID.test(String(x))));
}
export function developerDesignActor(uid,id,grant,today){
 if(uid!=='discord:'+id||grant?.profile!=='developer'||
  !isActiveVisualDesignGrant({uid,discordId:id},grant,today))return null;
 return {uid,discordId:id,role:'developer',departments:[],departmentRoles:{},
  portalDesignOnly:true,portalTechnicalMode:false,profileTechnicalAvailable:false};
}
