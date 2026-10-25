// Strict technical exception to the ordinary two-person manual role recovery.
// These flags are trusted only from the server's verified Discord session and
// signed HttpOnly technical-profile cookie. No browser-supplied role values.
const ID=/^\d{15,22}$/;
export function isVerifiedTechnicalRoleApprover(actor){
  return ID.test(String(actor?.discordId||''))&&
    actor.uid==='discord:'+actor.discordId&&
    actor.role==='beheerder'&&actor.portalTechnicalMode===true&&
    actor.profileTechnicalAvailable===true;
}
export function manualRoleDecisionScope(actor,request,subjectDiscordId){
  if(!actor||!request||!ID.test(String(subjectDiscordId||''))||
     actor.discordId===subjectDiscordId||
     actor.uid==='discord:'+subjectDiscordId)
    return {allowed:false,technicalOverride:false};
  const samePerson=request.requestedBy===actor.uid;
  const technicalOverride=samePerson&&isVerifiedTechnicalRoleApprover(actor);
  return {allowed:!samePerson||technicalOverride,technicalOverride};
}
