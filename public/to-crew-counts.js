const rows=value=>Array.isArray(value)?value:Object.values(value||{});
const records=value=>rows(value).filter(item=>item&&typeof item==='object');

function callsignKey(category,number){
  if(typeof category!=='string'||!['string','number'].includes(typeof number))return null;
  const value=String(number);
  if(!/^\d{1,5}$/.test(value)||Number(value)===0)return null;
  return JSON.stringify([category,Number(value)]);
}
function teamKeys(team){
  return new Set([team.roepnaam,...records(team.leden).map(member=>member.roep)]
    .map(number=>callsignKey(team.dienst,number)).filter(Boolean));
}

// Radio presence adds a derived count; saved TO decisions remain authoritative.
// Nothing here creates a crew, changes availability or writes to the board.
export function summarizeTOCrews(board,{users=[],fresh=false,categories=[]}={}){
  const allTeams=records(board?.ploegen),teams=allTeams.filter(team=>!team.endedAt);
  const activeIncidents=records(board?.meldingen).filter(incident=>incident.status==='actief');
  const busy=new Set(activeIncidents.flatMap(incident=>records(incident.ploegen)
    .map(team=>team.id).filter(id=>typeof id==='string'&&id)));
  const activeKeys=new Map(),endedKeys=new Set();
  for(const team of allTeams){
    for(const key of teamKeys(team)){
      if(team.endedAt){endedKeys.add(key);continue;}
      if(!activeKeys.has(key))activeKeys.set(key,new Set());
      activeKeys.get(key).add(team);
    }
  }
  const recognized=new Set(categories),radioOnly=new Set(),linked=new Set();
  const blockedRadioOnly=new Set(),blockedTeams=new Set(),pairedRadioOnly=new Set();
  if(fresh){
    for(const user of records(users)){
      if(!recognized.has(user.category))continue;
      const key=callsignKey(user.category,user.number);
      if(!key)continue;
      // A fresh NB from ANY radio member blocks the entire saved or radio-only
      // unit, including a koppel. One key = one unit irrespective of members.
      if(activeKeys.has(key))for(const team of activeKeys.get(key)){
        linked.add(team);
        if(user.notAvailable===true)blockedTeams.add(team);
      }
      else if(!endedKeys.has(key)){
        radioOnly.add(key);
        if(user.notAvailable===true)blockedRadioOnly.add(key);
        if(user.paired===true)pairedRadioOnly.add(key);
      }
    }
  }
  const inService=teams.length+radioOnly.size;
  const available=teams.filter(team=>team.available!==false&&!busy.has(team.id)&&
    !team.responsePhase&&!blockedTeams.has(team)).length+
    [...radioOnly].filter(key=>!blockedRadioOnly.has(key)).length;
  const pairedSaved=teams.filter(team=>team.koppel||(fresh&&records(users).some(user=>
    user.paired===true&&teamKeys(team).has(callsignKey(user.category,user.number))))).length;
  return {inService,available,unavailable:inService-available,boardTeams:teams.length,
    radioOnly:radioOnly.size,radioLinked:linked.size,
    paired:pairedSaved+pairedRadioOnly.size,
    activeIncidents:activeIncidents.length};
}
