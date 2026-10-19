import {getFirestore} from 'firebase-admin/firestore';
import {citizenDossiersEnabled,CITIZEN_COLLECTION,publicCitizenProfile} from './citizen-policy.js';
import {dossierScopes,dossierOverviewRows,dossierTimelineEntry} from './dossier-center-policy.js';
import {validPersonnelKey} from './personnel-editor-policy.js';
import {CREATED_PERSONNEL_COLLECTION,personnelDataEnabled} from './personnel-create.js';
import {PERSONNEL_EDITS_COLLECTION} from './personnel-editor-policy.js';
import {SERVICE_APPLICATIONS_COLLECTION,serviceApplicantDossierId} from './service-applications-policy.js';

const enabled=()=>process.env.BPD_ENABLE_DOSSIER_CENTER==='true';
const applicationsEnabled=()=>process.env.BPD_ENABLE_SERVICE_APPLICATIONS==='true';
const respond=(res,status,message)=>res.status(status).json({error:message});
const timestamp=x=>x?.toDate?.()?.toISOString?.()||null;
function failed(res,error){
  console.error('Dossiercentrum:',error?.code||error?.message||'onbekende fout');
  return respond(res,503,'Dossiercentrum tijdelijk niet beschikbaar');
}
async function timeline(ref,kind){
  const snap=await ref.collection('audit').orderBy('at','desc').limit(30).get();
  return snap.docs.map(d=>dossierTimelineEntry(d.data(),kind));
}
function publicPerson(p){
  return {dept:p.dept,discordId:p.personId,name:p.name,call:p.call,rank:p.rank,
    status:p.status,source:p.source||'google-sheets'};
}
function publicApplication(a){
  return {dept:a.dept,discordId:a.discordId,username:String(a.username||'').slice(0,80),
    status:a.status,motivation:String(a.motivation||'').slice(0,3000),
    decisionReason:typeof a.decisionReason==='string'?a.decisionReason.slice(0,500):null,
    createdAt:timestamp(a.createdAt),updatedAt:timestamp(a.updatedAt),
    decidedAt:timestamp(a.decidedAt)};
}
export function installDossierCenterRoutes(app,{requireUser,getSnapshot}){
  app.get('/api/dossiercentrum/overview',requireUser,async(req,res)=>{
    if(!enabled())return respond(res,503,'Het dossiercentrum is nog niet geactiveerd');
    const scopes=dossierScopes(req.bpd,applicationsEnabled());
    if(!scopes.personnelDepartments.length&&!scopes.applicationDepartments.length)
      return respond(res,403,'Geen toegelaten dossiers voor dit account');
    try{
      const db=getFirestore();
      const [snapshot,groups]=await Promise.all([
        scopes.personnelDepartments.length?getSnapshot():Promise.resolve({data:[],stale:false}),
        Promise.all(scopes.applicationDepartments.map(async dept=>{
          // Same bounded service-specific query as the existing review endpoint.
          const snap=await db.collection(SERVICE_APPLICATIONS_COLLECTION)
            .where('dept','==',dept).limit(101).get();
          if(snap.size>100)throw Error('Dossieroverzicht is te groot voor veilige weergave');
          return snap.docs.map(doc=>doc.data());
        }))
      ]);
      const personnel=snapshot.data.filter(p=>scopes.personnelDepartments.includes(p.dept));
      const rows=dossierOverviewRows(personnel,groups.flat(),scopes);
      return res.json({rows,departments:[...new Set([
        ...scopes.personnelDepartments,...scopes.applicationDepartments])],
        sourceStale:snapshot.stale===true,readOnly:true});
    }catch(e){return failed(res,e)}
  });

  app.get('/api/dossiercentrum/:dept/:discordId',requireUser,async(req,res)=>{
    if(!enabled())return respond(res,503,'Het dossiercentrum is nog niet geactiveerd');
    const {dept,discordId}=req.params;
    if(!validPersonnelKey(dept,discordId))return respond(res,400,'Ongeldig dossier');
    const scopes=dossierScopes(req.bpd,applicationsEnabled());
    const maySeePersonnel=scopes.personnelDepartments.includes(dept);
    const maySeeApplication=scopes.applicationDepartments.includes(dept);
    if(!maySeePersonnel&&!maySeeApplication)
      return respond(res,403,'Geen bevoegdheid voor dit dossier');
    try{
      const db=getFirestore();
      const [snapshot,candidate]=await Promise.all([
        maySeePersonnel?getSnapshot():Promise.resolve({data:[]}),
        maySeeApplication?db.collection(SERVICE_APPLICATIONS_COLLECTION)
          .doc(serviceApplicantDossierId(dept,discordId)).get():Promise.resolve(null)
      ]);
      const matches=snapshot.data.filter(p=>p.dept===dept&&p.personId===discordId);
      if(matches.length>1)return respond(res,409,'Meerdere identieke personeelsfiches; handmatige controle nodig');
      const p=matches[0]||null;
      const application=candidate?.exists&&candidate.get('dept')===dept&&
        candidate.get('discordId')===discordId?candidate.data():null;
      if(!p&&!application)return respond(res,404,'Geen dossier gevonden');
      // A general citizen record never independently grants dossier-center
      // discovery rights; it is visible only next to already authorised staff
      // or application data for this exact service and Discord ID.
      const citizenDoc=citizenDossiersEnabled(process.env)
        ?await db.collection(CITIZEN_COLLECTION).doc(discordId).get():null;
      const civilian=citizenDoc?publicCitizenProfile(citizenDoc.data(),discordId):null;
      const histories=[];
      if(p){
        histories.push(timeline(db.collection(PERSONNEL_EDITS_COLLECTION)
          .doc(dept+'_'+discordId),'personeel'));
        // Historical Sheet identities have no created-personnel events.
        if(p.createdInFirestore===true&&personnelDataEnabled(process.env))
          histories.push(timeline(db.collection(CREATED_PERSONNEL_COLLECTION)
            .doc(dept+'_'+discordId),'loopbaan'));
      }
      if(application&&candidate)
        histories.push(timeline(candidate.ref,'sollicitatie'));
      const timelineEntries=(await Promise.all(histories)).flat()
        .sort((a,b)=>(b.at||'').localeCompare(a.at||'')).slice(0,50);
      return res.json({dept,discordId,readOnly:true,citizen:civilian,
        matchNotice:p&&application?'Personeelsfiche en sollicitatie hebben hetzelfde Discord-ID. Controleer de identiteit vóór administratieve acties.':null,
        personnel:p?publicPerson(p):null,
        application:application?publicApplication(application):null,
        timeline:timelineEntries});
    }catch(e){return failed(res,e)}
  });
}
