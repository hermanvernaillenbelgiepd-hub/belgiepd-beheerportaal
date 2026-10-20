// Operational Sonoran availability markers. A standalone NB or (NB), regardless
// of its position in the radio label, means unavailable. Never treat a substring
// of an ordinary word (e.g. NBX, HAMB) as a status flag.
const nbMarker=/(?:^|[^A-Za-z])(?:\(\s*NB\s*\)|NB)(?=$|[^A-Za-z])/i;
const nbStrip=/(^|[^A-Za-z])(?:\(\s*NB\s*\)|NB)(?=$|[^A-Za-z])/gi;
export function radioMarkedUnavailable(value){
  return typeof value==='string'&&nbMarker.test(value);
}
export function stripRadioNBMarkers(value){
  return typeof value==='string'?value.replace(nbStrip,'$1').replace(/\s+/g,' ').trim():value;
}
// A single unavailable member is enough to make the whole radio-linked crew
// unavailable. This is derived from a FRESH radio snapshot, not stored to
// Firestore and not interpreted as a Discord/personnel authorization.
const key=(category,value)=>{
  if(typeof category!=='string'||!['string','number'].includes(typeof value))return null;
  const number=String(value);
  return /^\d{1,5}$/.test(number)&&Number(number)>0
    ?JSON.stringify([category,Number(number)]):null;
};
export function radioNBForTeam(team,users){
  if(!team||!Array.isArray(users))return false;
  const keys=new Set([team.roepnaam,...(Array.isArray(team.leden)?team.leden:[])
    .map(member=>member?.roep)].map(n=>key(team.dienst,n)).filter(Boolean));
  return users.some(user=>user?.notAvailable===true&&
    keys.has(key(user.category,user.number)));
}
