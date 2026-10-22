import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {validPersonnelKey} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {actorFromPersonnel} from './registrations.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {PERSONNEL_SPECIALIZATIONS_COLLECTION,specialtyReadEnabled,
  specialtyWritesEnabled,canChangeSpecialty,canSetSpecialtyValue,validateSpecialtyChange,
  validateSpecialtyBatch,publicSpecializations} from './specialization-policy.js';
const error=(res,status,message)=>res.status(status).json({error:message});
const failure=(code,message)=>Object.assign(new Error(message),{httpStatus:code});
function handleError(res,e){
  if(e?.httpStatus)return error(res,e.httpStatus,e.message);
  console.error('Specialisaties:',e?.code||e?.message||'onbekende fout');
  return error(res,503,'Specialisatieregister tijdelijk niet beschikbaar');
}
const belgianDay=()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
};
const highPoliceCadre=a=>['officierenkader','korpsleiding'].includes(a?.role)&&
  a?.dossierNativeDepartments?.includes('politie')&&
  ['officierenkader','korpsleiding'].includes(roleForDepartment(a,'politie'));
export function installSpecializationRoutes(app,{requireUser,getSnapshot}){
  async function subject(req){
    const {dept,discordId}=req.params;
    if(!validPersonnelKey(dept,discordId))throw failure(400,'Ongeldige personeelsreferentie');
    if(!canReadServiceDossier(req.bpd,dept))throw failure(403,'Geen inzagerecht voor dit dienstdossier');
    const snap=await getSnapshot();
    const matches=snap.data.filter(p=>p.dept===dept&&p.personId===discordId);
    if(matches.length!==1)throw failure(404,'Geen eenduidige personeelsfiche gevonden');
    return matches[0];
  }
  app.get('/api/personnel/:dept/:discordId/specializations',requireUser,async(req,res)=>{
    if(!specialtyReadEnabled(process.env))return error(res,503,'Specialisatieregister is nog uitgeschakeld');
    try{
      const staff=await subject(req);
      const ref=getFirestore().collection(PERSONNEL_SPECIALIZATIONS_COLLECTION)
        .doc(staff.dept+'_'+staff.personId);
      const [entry,history]=await Promise.all([
        ref.get(),ref.collection('audit').orderBy('at','desc').limit(40).get()
      ]);
      const state=publicSpecializations(staff,entry.data());
      return res.json({...state,canEdit:specialtyWritesEnabled(process.env)&&
        req.bpd.dossierNativeDepartments?.includes(staff.dept)&&canChangeSpecialty(req.bpd,staff),
        editMode:req.bpd.role==='middenkader'?'radio-training':'full',
        history:history.docs.map(doc=>{
          const d=doc.data();
          return {label:String(d.label||'').slice(0,64),
            previous:String(d.previous||'').slice(0,90),
            value:String(d.value||'').slice(0,90),
            source:d.source==='manual'?'manual':'unknown',
            reason:String(d.reason||'').slice(0,500),
            byDiscordId:/^\d{15,22}$/.test(d.actorDiscordId||'')?d.actorDiscordId:null,
            at:d.at?.toDate?.()?.toISOString?.()||null};
        }),historyLimited:history.size===40
      });
    }catch(e){return handleError(res,e)}
  });

  // The notification view is strictly for officers and corps leadership.
  app.get('/api/personnel/specialization-notifications',requireUser,async(req,res)=>{
    if(!highPoliceCadre(req.bpd))
      return error(res,403,'Alleen officierenkader en korpsleiding hebben toegang');
    try{
      const rows=await getFirestore().collection('bpd_notices').doc('politie')
        .collection('events').orderBy('createdAt','desc').limit(120).get();
      return res.json({events:rows.docs.map(doc=>({id:doc.id,...doc.data()}))
        .filter(x=>['specialization_changed','personnel_name_changed'].includes(x.type))
        .map(x=>({id:x.id,type:x.type,discordId:x.discordId,
          label:String(x.label||'').slice(0,65),
          from:String(x.from||'').slice(0,80),to:String(x.to||'').slice(0,80),
          actorDiscordId:x.actorDiscordId,
          createdAt:x.createdAt?.toDate?.()?.toISOString()||null}))
      });
    }catch(e){return handleError(res,e)}
  });
  app.post('/api/personnel/:dept/:discordId/specializations',requireUser,async(req,res)=>{
    if(!specialtyWritesEnabled(process.env))
      return error(res,503,'Specialisatiewijzigingen zijn nog niet geactiveerd');
    let proposal;
    try{
      proposal=Array.isArray(req.body?.changes)?
        validateSpecialtyBatch(req.body,req.params.dept):
        (()=>{const single=validateSpecialtyChange(req.body,req.params.dept);
          return {changes:[{label:single.label,value:single.value}],
            reason:single.reason,expectedRevision:single.expectedRevision}})();
    }catch(e){return error(res,400,e.message)}
    try{
      const staff=await subject(req);
      if(!req.bpd.dossierNativeDepartments?.includes(req.params.dept)||!canChangeSpecialty(req.bpd,staff)||
        proposal.changes.some(x=>!canSetSpecialtyValue(req.bpd,staff,x.label,x.value)))
        return error(res,403,'Geen bevoegdheid voor deze specialisatiewijziging');
      const db=getFirestore(),ref=db.collection(PERSONNEL_SPECIALIZATIONS_COLLECTION)
        .doc(staff.dept+'_'+staff.personId);
      const snap=await getSnapshot(),author=actorFromPersonnel(req.bpd,snap.data);
      const today=belgianDay();
      const revision=await db.runTransaction(async tx=>{
        const previous=await tx.get(ref),data=previous.data()||{};
        const current=Number.isSafeInteger(data.revision)?data.revision:0;
        if(current!==proposal.expectedRevision)
          throw failure(409,'De specialisaties zijn intussen gewijzigd. Vernieuw het dossier.');
        const existing=publicSpecializations(staff,data).items;
        const values={...(data.values&&typeof data.values==='object'&&!Array.isArray(data.values)
          ?data.values:{})};
        for(const change of proposal.changes){
          const old=existing.find(x=>x.label===change.label);
          if(!old||old.value===change.value)
            throw failure(409,'Geen nieuwe status voor '+change.label+'; vernieuw het dossier');
          values[change.label]={value:change.value,source:'manual'};
        }
        tx.set(ref,{dept:staff.dept,discordId:staff.personId,
          revision:current+1,values,updatedAt:FieldValue.serverTimestamp(),
          updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId||null});
        for(const change of proposal.changes){
          const old=existing.find(x=>x.label===change.label);
          const at=FieldValue.serverTimestamp();
          tx.create(ref.collection('audit').doc(),{
            action:'specialization_changed',label:change.label,
            previous:old.value,value:change.value,source:'manual',
            reason:proposal.reason,revision:current+1,actorUid:req.bpd.uid,
            actorDiscordId:req.bpd.discordId||null,at
          });
          // Each changed field has its own, immutable cadre notification.
          tx.create(db.collection('bpd_notices').doc(staff.dept).collection('events').doc(),{
            type:'specialization_changed',dept:staff.dept,discordId:staff.personId,
            caseId:staff.dept+'_'+staff.personId,label:change.label,
            from:old.value,to:change.value,actorDiscordId:req.bpd.discordId||null,
            createdAt:at});
          const type=change.value==='Te volgen'?'specialisatiebeperking':'activiteit';
          tx.create(db.collection('bpd_cases').doc(staff.dept+'_'+staff.personId)
            .collection('entries').doc(),{
            type,reportCategory:type,dept:staff.dept,subjectDiscordId:staff.personId,
            subjectNameAtCreation:staff.name,subjectCallAtCreation:staff.call,
            details:change.label+': '+old.value+' → '+change.value+'. '+proposal.reason,
            eventDate:today,registeredBy:author||{
              discordId:req.bpd.discordId||null,name:'Discord-gebruiker',
              call:'',rank:req.bpd.role,dept:staff.dept},
            source:'automatic_specialization_audit',createdAt:at,modifiedAt:null
          });
        }
        return current+1;
      });
      return res.json({saved:true,revision,count:proposal.changes.length,source:'manual',
        discordRoleChanged:false,sourceSheetsChanged:false});
    }catch(e){return handleError(res,e)}
  });
}
