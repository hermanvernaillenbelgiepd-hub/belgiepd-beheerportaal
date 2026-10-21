// Radio-presence observer. It only proposes removals; Firestore re-checks
// every condition atomically before recording an "uit dienst" event.
// Never trust roomId, stale cached users or a single transient channel drop.
export const RADIO_AUTO_END_GRACE_MS=120_000;
export const RADIO_AUTO_END_MIN_POLLS=3;
const key=(category,number)=>{
  if(typeof category!=='string'||!['string','number'].includes(typeof number))return null;
  const value=String(number);
  if(!/^\d{1,5}$/.test(value)||Number(value)===0)return null;
  return JSON.stringify([category,Number(value)]);
};
export const radioMatchesSavedTeam=(team,users=[])=>{
  if(!team||!Array.isArray(users))return false;
  const codes=new Set([team.roepnaam,...(Array.isArray(team.leden)?team.leden.map(x=>x.roep):[])]
    .map(number=>key(team.dienst,number)).filter(Boolean));
  return users.some(user=>codes.has(key(user?.category,user?.number)));
};
export function observeRadioDepartures(board,snapshot,tracker,now){
  if(!(tracker instanceof Map))throw new TypeError('Radio-tracker ontbreekt');
  // Reject old Sonoran fetches (including cached lastGood responses),
  // unknown/malformed timestamps and offline service states.
  const timestamp=Date.parse(snapshot?.fetchedAt||'');
  if(!board?.session||!snapshot?.connected||snapshot.stale||!snapshot.configured||
      !Array.isArray(snapshot.users)||!Array.isArray(snapshot.uncertainUnits)||
      !Number.isFinite(timestamp)||timestamp>now+1000||now-timestamp>45_000){
    tracker.clear();return [];
  }
  const sessionId=board.session.id;
  const previous=tracker.get('__session');
  if(previous!==sessionId){tracker.clear();tracker.set('__session',sessionId);}
  const active=Object.values(board.ploegen||{}).filter(x=>x&&!x.endedAt);
  const linked=new Set(Object.values(board.meldingen||{}).filter(x=>x?.status==='actief')
    .flatMap(item=>(item.ploegen||[]).map(x=>x.id)));
  const activeIds=new Set(active.map(x=>x.id));
  const ready=[];
  for(const team of active){
    if(!team?.id)continue;
    const uncertain=radioMatchesSavedTeam(team,snapshot.uncertainUnits);
    const present=radioMatchesSavedTeam(team,snapshot.users);
    if(present||uncertain){tracker.delete(team.id);continue;}
    const prev=tracker.get(team.id);
    if(!prev){
      tracker.set(team.id,{since:timestamp,polls:1,lastSnapshot:timestamp});
      continue;
    }
    // One fetch can be returned to many viewers from the 15s cache;
    // only a genuinely newer upstream poll confirms a second absence.
    if(timestamp<=prev.lastSnapshot)continue;
    const observation={since:prev.since,polls:prev.polls+1,lastSnapshot:timestamp};
    tracker.set(team.id,observation);
    if(!linked.has(team.id)&&timestamp-observation.since>=RADIO_AUTO_END_GRACE_MS&&
        observation.polls>=RADIO_AUTO_END_MIN_POLLS)ready.push(team.id);
  }
  for(const id of tracker.keys())if(id!=='__session'&&!activeIds.has(id))tracker.delete(id);
  return ready.slice(0,100);
}
