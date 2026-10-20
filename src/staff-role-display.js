import {recognizeRoles} from './role-catalog.js';
// Only recently verified guild membership can contribute to the staff display.
// Role labels never establish a portal permission or an active qualification.
export function staffRoleDisplay(member,department,guildId,now=Date.now()){
  const empty={verified:false,series:[],specializations:[]};
  if(!member||member.guildId!==guildId||!/^\d{15,22}$/.test(guildId)||
    !Number.isSafeInteger(member.verifiedAt)||
    now-member.verifiedAt>900000||member.verifiedAt>now||
    !Array.isArray(member.roleIds)||member.roleIds.some(id=>!/^\d{15,22}$/.test(id)))
    return empty;
  const roles=recognizeRoles(member.roleIds).filter(r=>r.dept===department);
  return {verified:true,
    series:roles.filter(r=>r.dept==='politie'&&/^Reeks [1-9]\d*$/.test(r.name))
      .map(r=>({name:r.name,roleId:r.id})),
    specializations:roles.filter(r=>r.kind==='specialisatie')
      .map(r=>({name:r.name,stage:r.stage,roleId:r.id}))};
}
