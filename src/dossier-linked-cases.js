// One authoritative personnel-case record; additional dossiers hold only a link.
// A linked entry never creates a second observation score, sanction or weekreport.
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {isRetired} from './dossier-retirement-policy.js';
const ID=/^\d{15,22}$/;
const ENTRY=/^[A-Za-z0-9]{12,30}$/;
const CASE_TYPES=new Set(['observatie','notitie','algemene_notitie']);
export const LINKED_CASES_COLLECTION='bpd_case_links';
export function verifiedColleagueLink(value,dept,primaryId,roster,actor,type){
 if(value===undefined||value===null||value==='')return null;
 if(!CASE_TYPES.has(type)||typeof value!=='string'||!ID.test(value)||
   value===primaryId)throw Error('Ongeldige gekoppelde collega voor deze registratie');
 const matches=(roster||[]).filter(p=>p.dept===dept&&p.personId===value);
 if(matches.length!==1||!canReadPersonnelSubject(actor,matches[0]))
   throw Error('Geen dossierbevoegdheid voor de gekoppelde collega');
 return matches[0];
}
export function createColleagueLink(db,batch,{dept,primaryId,entryId,type,eventDate,colleague,at}){
 if(!colleague)return;
 batch.create(db.collection(LINKED_CASES_COLLECTION).doc(dept+'_'+colleague.personId)
   .collection('entries').doc(entryId),{
    dept,sourceDiscordId:primaryId,sourceEntryId:entryId,
    type,eventDate,createdAt:at
   });
}
const isVisibleLinkedRecord=(record,sourceId,dept,targetId,type)=>Boolean(
 record&&CASE_TYPES.has(record.type)&&record.type===type&&
 record.dept===dept&&record.subjectDiscordId===sourceId&&
 record.linkedColleagueId===targetId&&!isRetired(record));
export async function loadLinkedCaseEntries(db,actor,roster,dept,targetId,types){
 const index=await db.collection(LINKED_CASES_COLLECTION).doc(dept+'_'+targetId)
   .collection('entries').limit(60).get();
 const allowed=new Set(types);
 const valid=index.docs.filter(doc=>{
   const x=doc.data();
   return x.dept===dept&&x.sourceDiscordId!==targetId&&ID.test(x.sourceDiscordId)&&
     ENTRY.test(x.sourceEntryId)&&x.sourceEntryId===doc.id&&allowed.has(x.type);
 });
 const entries=await Promise.all(valid.map(async doc=>{
   const link=doc.data(),sources=(roster||[]).filter(p=>p.dept===dept&&
     p.personId===link.sourceDiscordId);
   if(sources.length!==1||!canReadPersonnelSubject(actor,sources[0]))return null;
   const source=sources[0],ref=db.collection('bpd_cases')
     .doc(dept+'_'+link.sourceDiscordId).collection('entries').doc(link.sourceEntryId);
   const origin=await ref.get(),record=origin.data();
   if(!origin.exists||!isVisibleLinkedRecord(record,source.personId,dept,targetId,link.type))
     return null;
   return {
     id:'linked_'+origin.id,linked:true,type:record.type,
     dept,subjectDiscordId:targetId,
     linkedSource:{discordId:source.personId,call:String(source.call||'').slice(0,30),
       name:String(source.name||'').slice(0,120)},
     eventDate:record.eventDate,eventTime:record.eventTime||'',
     details:'Gekoppelde registratie uit dossier '+String(source.call||'—')+' · '+
       String(source.name||'—')+'\n'+String(record.details||'').slice(0,6000),
     registeredBy:{name:String(record.registeredBy?.name||'Onbekend').slice(0,120),
       call:String(record.registeredBy?.call||'').slice(0,30)},
     // Mirrors are references, not new observations; do not count score twice.
     ...(record.type==='observatie'?{score:null}:{}),
     createdAt:record.createdAt||null
   };
 }));
 return {entries:entries.filter(Boolean),limited:index.size===60};
}
export function sameDayCategories(entries){
 const names={observatie:'observatie',sanctie:'sanctie',notitie:'belangrijke notitie',
   algemene_notitie:'algemene notitie'};
 const active=(entries||[]).filter(e=>!isRetired(e)&&Object.hasOwn(names,e.type));
 const types=Object.fromEntries([...new Set(active.map(e=>e.type))]
   .map(type=>[type,active.filter(e=>e.type===type).length]));
 return {count:active.length,types};
}
