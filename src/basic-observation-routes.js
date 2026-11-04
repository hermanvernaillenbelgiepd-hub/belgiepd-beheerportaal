import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {validateEntry} from './registrations.js';
import {basicObservationTargets,mayReadBasicInbox,basicObservationDenial,
 basicObservationWritesEnabled,basicCallLevel} from './basic-observation-policy.js';
import {receivedAccess} from './received-registration-policy.js';

const POL='politie';
const ID=/^\d{15,22}$/;
const err=(res,code,msg)=>res.status(code).json({error:msg});
const iso=value=>value?.toDate?.()?.toISOString?.()||null;
const txt=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const actorSafe=a=>({name:txt(a.name,120),call:txt(a.call,35),rank:txt(a.rank,120),discordId:a.personId||a.discordId});
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
        canReview:review,writesEnabled:basicObservationWritesEnabled(process.env),
        actor:access.author?actorSafe(access.author):null,
        targets:access.targets.map(p=>({...actorSafe(p),dept:POL})),
        source:'Centrale personeelslijst van Personeelsbeheer',
        explanation:access.author?
          'Observaties zijn alleen mogelijk over medewerkers met een lagere politierang (1xx–5xx). Geen sancties.':
          basicObservationDenial(req.bpd,roster)});
    }catch(e){
      if(e.status)return err(res,e.status,e.message);
      console.error('Basiskader-observatie context:',e.code||e.message);
      return err(res,503,'De centrale personeelslijst is tijdelijk niet beschikbaar');
    }
  });
  app.post('/api/basic-observations',requireUser,async(req,res)=>{
    if(!basicObservationWritesEnabled(process.env))
      return err(res,503,'Basiskader-observaties zijn uitgeschakeld in de serverconfiguratie');
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
      // The verified Police person is the observation author even when the
      // portal account's primary function belongs to another service.
      const policePerson=access.author;
      if(policePerson.personId!==req.bpd.discordId)
        return err(res,403,'Eigen politie-identiteit kon niet worden bevestigd');
      const author={discordId:policePerson.personId,name:policePerson.name,
        call:policePerson.call,rank:policePerson.rank,dept:POL};
      const validated=validateEntry({...body,type:'observatie'});
      // Strictly separate from bpd_cases and staff dossier entries.
      const target=targets[0],db=getFirestore();
      const item=db.collection('bpd_basic_observations').doc();
      await item.create({...validated,dept:POL,subjectDiscordId:target.personId,
        subjectNameAtCreation:target.name,subjectCallAtCreation:target.call,
        registeredBy:author,submittedByActor:author,
        submittedBy:{uid:req.bpd.uid,email:req.bpd.email},
        source:'observatie-vanuit-basiskader',
        createdAt:FieldValue.serverTimestamp(),modifiedAt:null});
      return res.status(201).json({saved:true,reference:item.id});
    }catch(e){
      if(e.status)return err(res,e.status,e.message);
      if(/^(Ongeldig|Ongeldige|Vereist|Gebruik een geldige)/.test(e.message))
        return err(res,400,e.message);
      console.error('Basiskader-observatie opslaan:',e.code||e.message);
      return err(res,503,'Beveiligde observatie kon niet worden opgeslagen');
    }
  });
  // Exclusive inbox for observations from the basic cadre. Never read dossier entries.
  app.get('/api/basic-observations/inbox',requireUser,async(req,res)=>{
    if(!mayReadBasicInbox(req.bpd))
      return err(res,403,'Alleen Middenkader, Officierenkader en Korpsleiding mogen deze observaties bekijken');
    try{
      const roster=await latestSubjects(getSnapshot);
      const people=roster.filter(p=>p.dept===POL);
      const db=getFirestore(),records=db.collection('bpd_basic_observations');
      const cursor=String(req.query.cursor||'');
      if(cursor&&!/^[A-Za-z0-9_-]{12,32}$/.test(cursor))
        return err(res,400,'Ongeldige pagina-verwijzing');
      let query=records.orderBy('createdAt','desc').limit(160);
      if(cursor){
        const previous=await records.doc(cursor).get();
        if(!previous.exists)return err(res,400,'Pagina-verwijzing niet gevonden');
        query=query.startAfter(previous);
      }
      const snapshots=await query.get(),rows=[];
      for(const doc of snapshots.docs){
        const e=doc.data(),author=e.submittedByActor||e.registeredBy;
        if(e.type!=='observatie'||e.dept!==POL||
           ![1,2,3].includes(basicCallLevel({dept:POL,call:author?.call})))continue;
        const subject=staffCount(people,e.subjectDiscordId);
        if(subject.length!==1)continue;
        if(!req.bpd.boardPersonnelAdmin&&
           !receivedAccess(req.bpd,subject[0]).includes('basiskader'))continue;
        rows.push({id:doc.id,eventDate:txt(e.eventDate,10),
          eventTime:txt(e.eventTime,5),createdAt:iso(e.createdAt),
          details:txt(e.details,6000),testRecord:e.testRecord===true,
          actor:{name:txt(author.name,120),call:txt(author.call,30),rank:txt(author.rank,120)},
          subject:{name:txt(subject[0].name,120),call:txt(subject[0].call,30),
            rank:txt(subject[0].rank,120),discordId:subject[0].personId}});
      }
      res.set('Cache-Control','private, no-store');
      return res.json({entries:rows,
        nextCursor:snapshots.docs.length===160?snapshots.docs[snapshots.docs.length-1].id:null,
        description:'Afzonderlijk en beveiligd register van observaties vanuit Basiskader.'});
    }catch(e){
      if(e.status)return err(res,e.status,e.message);
      console.error('Basiskader ontvangen observaties:',e.code||e.message);
      return err(res,503,'Ontvangen observaties zijn tijdelijk niet beschikbaar');
    }
  });
}
