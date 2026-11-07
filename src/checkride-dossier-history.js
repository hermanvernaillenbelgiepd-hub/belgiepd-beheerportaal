import {CHECKRIDE_TRACKS} from './checkride-policy.js';
const ID=/^\d{15,22}$/;
const iso=v=>v?.toDate?.()?.toISOString()||null;
// Every evaluation remains stored exactly once in its original track.
// A dossier reads only evaluations where department AND Discord subject match.
export async function loadSubjectCheckrides(db,dept,discordId){
  if(!ID.test(String(discordId||''))||
     !['politie','ambulance','brandweer','depannage','burger'].includes(dept))
    throw Error('Ongeldige dienstgebonden personeelsidentiteit');
  const tracks=Object.values(CHECKRIDE_TRACKS).filter(t=>t.dept===dept);
  const query=await Promise.all(tracks.map(async track=>{
    const snapshot=await db.collection('bpd_checkride_tracks').doc(track.code)
      .collection('evaluations').where('subjectDiscordId','==',discordId).limit(100).get();
    return {track,docs:snapshot.docs,limited:snapshot.size===100};
  }));
  const evaluations=query.flatMap(({track,docs})=>docs.filter(d=>{
    const e=d.data();
    return e.subjectDiscordId===discordId&&e.department===dept&&
      e.track===track.code&&e.status==='ingediend';
  }).map(doc=>{
    const e=doc.data();
    return {id:doc.id,track:track.code,trackLabel:track.label,department:dept,
      subjectDiscordId:discordId,eventDate:String(e.eventDate||'').slice(0,10),
      kind:String(e.kind||'').slice(0,25),outcome:String(e.outcome||'').slice(0,35),
      average:Number.isFinite(e.average)?e.average:null,
      scores:e.scores||null,notes:String(e.notes||'').slice(0,1500),
      evaluatorDiscordId:ID.test(String(e.evaluatorDiscordId||''))?e.evaluatorDiscordId:null,
      createdAt:iso(e.createdAt)};
  })).sort((a,b)=>b.eventDate.localeCompare(a.eventDate)||
    (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,100);
  return {evaluations,limited:query.some(q=>q.limited)||evaluations.length===100};
}
