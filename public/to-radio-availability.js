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
// A trailing star after a numbered callsign denotes a shared/paired radio
// shift. NB may occur before or after the star, so remove it first.
export function radioMarkedPair(value){
  if(typeof value!=='string')return false;
  const head=stripRadioNBMarkers(value.split('|')[0]).trim();
  return /\d{1,5}\*\s*$/.test(head);
}

// Group ONLY a precisely matching category + positive numeric unit when at
// least one of its users explicitly carries *. Never infer links between
// unrelated callsigns. Raw radio users remain unchanged for auth/audit.
export function groupRadioCrews(users=[]){
  if(!Array.isArray(users))return [];
  const byKey=new Map();
  for(const user of users){
    const id=key(user?.category,user?.number);
    if(!id)continue;
    if(!byKey.has(id))byKey.set(id,[]);
    byKey.get(id).push(user);
  }
  const seen=new Set(),result=[];
  for(const user of users){
    const id=key(user?.category,user?.number),members=id?byKey.get(id):null;
    const shared=members?.some(item=>item.paired===true);
    if(shared){
      if(seen.has(id))continue;
      seen.add(id);
      result.push({category:user.category,number:user.number,paired:true,
        radioUnavailable:members.some(item=>item.notAvailable===true),
        members});
    }else result.push({category:user?.category,number:user?.number,
      paired:false,radioUnavailable:user?.notAvailable===true,members:[user]});
  }
  return result;
}

// A single unavailable member is enough to make the whole radio-linked crew
// unavailable. This is derived from a FRESH radio snapshot, not stored to
// Firestore and not interpreted as a Discord/personnel authorization.
const key=(category,value)=>{
  if(typeof category!=='string'||!['string','number'].includes(typeof value))return null;
  const number=String(value);
  if(['HARTS','HVPK'].includes(category)&&number===category)return JSON.stringify([category,number]);
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
