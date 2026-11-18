import {roleSummary} from './role-catalog.js';
const ID=/^\d{15,22}$/;
const WINDOW=15*60*1000;
// A review signal only. Never used to grant, revoke or elevate portal rights.
// Snapshot comes from the authenticated guild and is checked for freshness.
export function leadershipRoleDifference(account,member,guildId,now=Date.now()){
 const id=String(account?.discordId||'');
 if(account?.status!=='approved'||!ID.test(id)||!Array.isArray(account.departments))
  return null;
 if(!member||member.guildId!==guildId||!ID.test(guildId)||
   !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
   now-member.verifiedAt>WINDOW||!Array.isArray(member.roleIds)||
   member.roleIds.some(role=>!ID.test(role)))
  return {discordId:id,status:'stale',department:null,expected:null,actual:null};
 const known=roleSummary(member.roleIds),seen=new Set(member.roleIds);
 const results=[];
 const proofs={
  brandweer:{middenkader:'1554906632897560787',officierenkader:'1395115819020714105'},
  ambulance:{middenkader:'1309532437952466988',officierenkader:'1309532438053130325'},
  depannage:{korpsleiding:'1309532438019706969'}
 };
 for(const dept of account.departments){
  const expected=account.departmentRoles?.[dept];
  if(!expected)continue;
  if(dept==='politie'){
   const actual=known.policeRank||'geen kaderrol';
   if(expected!==actual){
    // Agentenkader/Politie-basis may be verified by personnel roster independently.
    if(expected==='basiskader'&&!known.policeRank)continue;
    results.push({discordId:id,status:'different',department:dept,expected,actual});
   }
  }else if(proofs[dept]?.[expected]&&!seen.has(proofs[dept][expected])){
   results.push({discordId:id,status:'needs_review',department:dept,
     expected,actual:'Rol ontbreekt in recente Discord-verificatie; officiële dienstfiche afzonderlijk controleren'});
  }
 }
 return results.length?results:null;
}
