import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {actorFromPersonnel,validateEntry} from './registrations.js';
import {basicObservationTargets,basicEligibleTarget,mayReadBasicInbox} from './basic-observation-policy.js';
import {receivedAuthor,receivedAccess} from './received-registration-policy.js';

const POL='politie';
const ID=/^\d{15,22}$/;
const err=(res,code,msg)=>res.status(code).json({error:msg});
const iso=value=>value?.toDate?.()?.toISOString?.()||null;
const txt=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const actorSafe=a=>({name:txt(a.name,120),call:txt(a.call,35),rank:txt(a.rank,120),discordId:a.discordId});
const latestSubjects=async getSnapshot=>{
  const snapshot=await getSnapshot();
  if(snapshot.stale)throw Object.assign(new Error('Centrale personeelslijst tijdelijk verouderd'),{status:503});
  return snapshot.data;
};
const staffCount=(list,id)=>list.filter(p=>p.dept===POL&&p.personId===id);
export function installBasicObservationRoutes(app,{requireUser,getSnapshot}){
  app.get('/api/basic-observations/context',requireUser,async(req,res)=>{
    try{
      const roster=await latestSubjects(getSnapshot);
      const access=basicObservationTargets(req.bpd,roster),review=mayReadBasicInbox(req.bpd);
      res.set('Cache-Control','private, no-store');
      res.json({canSubmit:!!access.author,
        canReview:review,writesEnabled:process.env.BPD_ENABLE_REGISTRATIONS==='true',
        actor:access.author?actorSafe(access.author):null,
        targets:access.targets.map(p=>({...actorSafe(p),dept:POL})),
        source:'Centrale personeelslijst van Personeelsbeheer',
        explanation:access.author?
          'Observaties zijn alleen mogelijk over medewerkers met een lagere politierang (1xx–5xx). Geen sancties.':
          'Alleen Basiskader kan hier een observatie indienen; Middenkader en hoger bekijken het beveiligde ontvangen overzicht.'});
    }catch(e){
      if(e.status)return err(res,e.status,e.message);
      console.error('Basiskader-observatie context:',e.code||e.message);
      return err(res,503,'De centrale personeelslijst is tijdelijk niet beschikbaar');
    }
  });
  app.post('/api/basic-observations',requireUser,async(req,res)=>{
    if(process.env.BPD_ENABLE_REGISTRATIONS!=='true')
      return err(res,503,'Registraties staan uit in de serverconfiguratie');
    const body=req.body||{};
    if(body.type && body.type!=='observatie'||
       Object.keys(body).some(k=>!['type','discordId','eventDate','eventTime',
         'details','otherPlayers','evidenceUrl'].includes(k)))
      return err(res,400,'Deze module accepteert uitsluitend observaties, geen sancties of rolwijzigingen');
    if(!ID.test(body.discordId))return err(res,400,'Kies een geldig personeelslid');
    try{
      const roster=await latestSubjects(getSnapshot);
      const access=basicObservationTargets(req.bpd,roster);
      const targets=access.targets.filter(p=>p.personId===body.discordId);
      if(!access.author||targets.length!==1)
        return err(res,403,'Je kunt enkel politieleden van een lagere rang observeren');
      const author=actorFromPersonnel(req.bpd,roster);
      if(!author||author.discordId!==access.author.personId)
        return err(res,403,'Eigen personeelsidentiteit kon niet worden bevestigd');
      const validated=validateEntry({...body,type:'observatie'});
      const target=targets[0],db=getFirestore();
      const item=db.collection('bpd_cases').doc(POL+'_'+target.personId).collection('entries').doc();
      const notification=db.collection('bpd_notices').doc(POL).collection('events').doc();
      const time=FieldValue.serverTimestamp(),batch=db.batch();
      batch.create(item,{...validated,dept:POL,subjectDiscordId:target.personId,
        subjectNameAtCreation:target.name,subjectCallAtCreation:target.call,
        registeredBy:author,submittedByActor:author,onBehalfOf:null,onBehalfReason:'',
        submittedBy:{uid:req.bpd.uid,email:req.bpd.email},
        source:'observatie-vanuit-basiskader',createdAt:time,modifiedAt:null});
      batch.create(notification,{caseId:POL+'_'+target.personId,
        entryId:item.id,type:'observatie',dept:POL,createdAt:time});
      await batch.commit();
      return res.status(201).json({saved:true,reference:item.id});
    }catch(e){
      if(e.status)return err(res,e.status,e.message);
      if(/^(Ongeldig|Ongeldige|Vereist|Gebruik een geldige)/.test(e.message))
        return err(res,400,e.message);
      console.error('Basiskader-observatie opslaan:',e.code||e.message);
      return err(res,503,'Beveiligde observatie kon niet worden opgeslagen');
    }
  });
  // Leest uit het BESTAANDE dossier- en meldingenregister (inclusief ouder werk).
  // Geen nieuwe opslag of niet-afgeschermde cross-person zoekopdracht.
  app.get('/api/basic-observations/inbox',requireUser,async(req,res)=>{
    if(!mayReadBasicInbox(req.bpd))
      return err(res,403,'Alleen Middenkader, Officierenkader, Korpsleiding en Bestuur mogen deze observaties bekijken');
    try{
      const roster=await latestSubjects(getSnapshot);
      const people=roster.filter(p=>p.dept===POL);
      const db=getFirestore();
      const notices=await db.collection('bpd_notices').doc(POL).collection('events')
        .orderBy('createdAt','desc').limit(250).get();
      const picked=notices.docs.map(d=>d.data()).filter(e=>e.type==='observatie'&&
        typeof e.caseId==='string'&&/^politie_\d{15,22}$/.test(e.caseId)&&
        typeof e.entryId==='string'&&/^[A-Za-z0-9_-]{12,32}$/.test(e.entryId));
      const refs=picked.map(e=>db.collection('bpd_cases').doc(e.caseId)
        .collection('entries').doc(e.entryId));
      const snapshots=[];
      for(let i=0;i<refs.length;i+=80)
        snapshots.push(...await db.getAll(...refs.slice(i,i+80)));
      const rows=[];
      for(let i=0;i<snapshots.length;i++){
        const item=snapshots[i];
        if(!item.exists)continue;
        const e=item.data();
        if(e.type!=='observatie')continue;
        const author=receivedAuthor(e,people);
        // De indeling gebruikt de door de server opgeslagen rang bij indiening,
        // niet een door de aanvrager of browser gekozen kadercategorie.
        if(author?.bucket!=='basiskader'||!/^[345]\d\d$/.test(
          String(author.call||'').replace(/^S[- ]?/i,'')))continue;
        const targetId=e.subjectDiscordId;
        if(!ID.test(targetId))continue;
        const subject=staffCount(people,targetId);
        if(subject.length!==1)continue;
        if(!req.bpd.boardPersonnelAdmin&&
           !receivedAccess(req.bpd,subject[0]).includes('basiskader'))continue;
        rows.push({id:item.id,eventDate:txt(e.eventDate,10),
          eventTime:txt(e.eventTime,5),createdAt:iso(e.createdAt),
          details:txt(e.details,6000),testRecord:e.testRecord===true,
          actor:{name:txt(author.name,120),call:txt(author.call,30),rank:txt(author.rank,120)},
          subject:{name:txt(subject[0].name,120),call:txt(subject[0].call,30),
            rank:txt(subject[0].rank,120),discordId:subject[0].personId}});
      }
      res.set('Cache-Control','private, no-store');
      return res.json({entries:rows,limited:notices.docs.length===250,
        description:'Ontvangen observaties vanuit Basiskader; uitsluitend aan bevoegde kaderleden en Bestuur. Maximaal de 250 recentste registratiemeldingen doorzocht.'});
    }catch(e){
      if(e.status)return err(res,e.status,e.message);
      console.error('Basiskader ontvangen observaties:',e.code||e.message);
      return err(res,503,'Ontvangen observaties zijn tijdelijk niet beschikbaar');
    }
  });
}
