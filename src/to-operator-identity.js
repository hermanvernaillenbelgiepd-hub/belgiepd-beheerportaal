// A TO callsign is bound to the authenticated Discord identity, never to a
// chosen login nickname or a client-provided number. Role and access checks are
// performed independently by the existing TO board policy.
const discordPattern=/^\d{15,22}$/;
export const validTOCall=value=>typeof value==='string'&&/^\d{1,5}$/.test(value)&&Number(value)>0;
export const temporaryTOCall=value=>validTOCall(value)&&Number(value)>=100&&Number(value)<=199;

export function callsignForTO(actor,personnel=[],temporaryRequest=null){
  const discordId=String(actor?.discordId||'');
  if(!discordPattern.test(discordId))return null;
  const matches=(Array.isArray(personnel)?personnel:[]).filter(person=>
    person?.dept==='politie'&&person.personId===discordId&&validTOCall(person.call));
  // If the source assigns conflicting callsigns for the same Discord ID,
  // never guess which one is the operator's identity.
  const calls=[...new Set(matches.map(person=>person.call))];
  if(calls.length===1)return {call:calls[0],source:'personeelslijst'};
  if(calls.length>1)return null;
  // Temporary callsigns are officer-verified requests, scoped by Discord ID.
  // An unverified application, Discord nickname or role is NOT evidence.
  if(temporaryRequest?.discordId===discordId&&temporaryRequest.status==='verified'&&
     temporaryTOCall(temporaryRequest.temporaryCall))
    return {call:temporaryRequest.temporaryCall,source:'geverifieerd_tijdelijk'};
  return null;
}

export function isTemporaryTOUnit(value){
  return validTOCall(value)&&Number(value)>=100&&Number(value)<=199;
}
