// DC-ID is the existing, immutable Discord identity for a linked member.
// Callsign and name are display fields and may change after promotion or edits.
// Only legacy/public cards without an ID use the old call/name fallback.
export function findOrganogramCardPerson(records,selection){
 if(!Array.isArray(records)||selection?.dept!=='politie')return null;
 const dcId=String(selection.dcId||'').trim();
 if(dcId){
  if(!/^\d{15,22}$/.test(dcId))return null;
  return records.find(person=>person?.dept==='politie'&&
   person.personId===dcId)||null;
 }
 const call=String(selection.call||'').trim().toLocaleLowerCase('nl-BE');
 const name=String(selection.name||'').trim().toLocaleLowerCase('nl-BE');
 if(!/^[a-z0-9 *_-]{1,24}$/i.test(call))return null;
 const matches=records.filter(person=>person?.dept==='politie'&&
  String(person.call||'').trim().toLocaleLowerCase('nl-BE')===call&&
  (!name||String(person.name||'').trim().toLocaleLowerCase('nl-BE')===name));
 // Never pick a random record when legacy lookups are ambiguous.
 return matches.length===1?matches[0]:null;
}
