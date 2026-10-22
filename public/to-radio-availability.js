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
  const head=stripRadioNBMarkers(value.split(/[|│｜¦∣ǀ∥‖❘︱]/)[0]).trim();
  return /\d{1,5}\*\s*$/.test(head)||
    /\d{1,5}\*\s+[A-Za-zÀ-ÿ]/.test(head);
}

// Koppels: nooit op basis van eenzelfde kanaal alleen. Alleen twee expliciet
// met * gemarkeerde, verschillende numerieke callsigns in dezelfde categorie
// en hetzelfde radiokanaal vormen één koppel. Het hoogste nummer is ploegnummer.
// Bij >2 gemarkeerde gebruikers blijft de koppeling onzeker: niet samenvoegen.
export function groupRadioCrews(users=[]){
  if(!Array.isArray(users))return [];
  const byKey=new Map(),starChannels=new Map();
  for(const user of users){
    const id=key(user?.category,user?.number);
    if(id){if(!byKey.has(id))byKey.set(id,[]);byKey.get(id).push(user);}
    if(user?.paired===true&&id&&typeof user.channel==='string'&&user.channel){
      const group=JSON.stringify([user.category,user.channel]);
      if(!starChannels.has(group))starChannels.set(group,[]);
      starChannels.get(group).push(user);
    }
  }
  const crossPairs=new Map();
  for(const entries of starChannels.values()){
    if(entries.length!==2||entries[0].category!==entries[1].category||
       key(entries[0].category,entries[0].number)===key(entries[1].category,entries[1].number))continue;
    if(entries.some(user=>byKey.get(key(user.category,user.number))?.length!==1))continue;
    for(const member of entries)crossPairs.set(member,entries);
  }
  const seen=new Set(),result=[];
  for(const user of users){
    if(seen.has(user))continue;
    const pair=crossPairs.get(user);
    if(pair){
      for(const member of pair)seen.add(member);
      const highest=pair.reduce((a,b)=>Number(b.number)>Number(a.number)?b:a);
      result.push({category:user.category,number:String(highest.number),paired:true,
        radioUnavailable:pair.some(item=>item.notAvailable===true),members:pair});
      continue;
    }
    const id=key(user?.category,user?.number),members=id?byKey.get(id):null;
    const shared=members?.some(item=>item.paired===true);
    if(shared){
      for(const member of members)seen.add(member);
      result.push({category:user.category,number:user.number,paired:true,
        radioUnavailable:members.some(item=>item.notAvailable===true),members});
    }else {
      seen.add(user);
      result.push({category:user?.category,number:user?.number,paired:false,
        radioUnavailable:user?.notAvailable===true,members:[user]});
    }
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
