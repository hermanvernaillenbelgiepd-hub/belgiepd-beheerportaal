import {CHECKRIDE_TRACKS} from './checkride-policy.js';
import {DC_TRANSFER_ALIASES,DC_TRANSFER_TARGETS} from './dc-id-transfer-policy.js';
const ID=/^\d{15,22}$/;
const iso=v=>v?.toDate?.()?.toISOString()||null;
// A completed, double-checked identity transfer can display earlier immutable
// evaluations under the new Discord identity. No evaluation or evaluator is edited.
async function verifiedHistoricalSubjectIds(db,newId){
  const target=await db.collection(DC_TRANSFER_TARGETS).doc(newId).get();
  if(!target.exists)return [newId];
  const oldId=target.get('oldDiscordId');
  if(!ID.test(String(oldId||''))||oldId===newId)
    throw Error('Ongeldige DC-ID-overdracht voor opleidingshistoriek');
  const alias=await db.collection(DC_TRANSFER_ALIASES).doc(oldId).get();
  if(!alias.exists||alias.get('status')!=='completed'||alias.get('newDiscordId')!==newId)
    throw Error('DC-ID-overdracht kon niet onafhankelijk worden bevestigd');
  return [newId,oldId];
}
// Every evaluation remains stored exactly once in its original track.
// A dossier reads only evaluations where department AND verified Discord subject match.
export async function loadSubjectCheckrides(db,dept,discordId){
  if(!ID.test(String(discordId||''))||
     !['politie','ambulance','brandweer','depannage','burger'].includes(dept))
    throw Error('Ongeldige dienstgebonden personeelsidentiteit');
  const tracks=Object.values(CHECKRIDE_TRACKS).filter(t=>t.dept===dept);
  const subjectIds=await verifiedHistoricalSubjectIds(db,discordId);
  const query=await Promise.all(tracks.flatMap(track=>subjectIds.map(async sourceId=>{
    const snapshot=await db.collection('bpd_checkride_tracks').doc(track.code)
      .collection('evaluations').where('subjectDiscordId','==',sourceId).limit(100).get();
    return {track,sourceId,docs:snapshot.docs,limited:snapshot.size===100};
  })));
  const evaluations=query.flatMap(({track,sourceId,docs})=>docs.filter(d=>{
    const e=d.data();
    return e.subjectDiscordId===sourceId&&e.department===dept&&
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
