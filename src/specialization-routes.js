import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {extraSpecialtyLabels} from './roster-column-config.js';
import {validPersonnelKey} from './personnel-editor-policy.js';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {verifiedPoliceLrdSubject,LRD_SPECIALTY_LABEL} from './police-lrd-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {PERSONNEL_SPECIALIZATIONS_COLLECTION,specialtyReadEnabled,
  specialtyWritesEnabled,canChangeSpecialty,validateSpecialtyChange,
  publicSpecializations} from './specialization-policy.js';
const error=(res,status,message)=>res.status(status).json({error:message});
const failure=(code,message)=>Object.assign(new Error(message),{httpStatus:code});
function handleError(res,e){
  if(e?.httpStatus)return error(res,e.httpStatus,e.message);
  console.error('Specialisaties:',e?.code||e?.message||'onbekende fout');
  return error(res,503,'Specialisatieregister tijdelijk niet beschikbaar');
}
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
      const [entry,history,customLabels]=await Promise.all([
        ref.get(),ref.collection('audit').orderBy('at','desc').limit(40).get(),
        extraSpecialtyLabels(staff.dept)
      ]);
      const state=publicSpecializations(staff,entry.data(),customLabels);
      if(staff.dept==='politie'){
        // LRD is optional. An absent/failed bot verification must not leave a
        // fake "Niet gecontroleerd" specialty on every police dossier.
        // No manual or Sheets value can activate this Discord-only function.
        let hasLrd=false;
        try{hasLrd=await verifiedPoliceLrdSubject(staff.personId);}
        catch(error){
          console.error('LRD-verificatie niet beschikbaar:',
            error?.code||'Discord-role lookup');
        }
        if(hasLrd)state.items.push({
          label:LRD_SPECIALTY_LABEL,value:'Ja',source:'discord-bot',readOnly:true
        });
      }
      return res.json({...state,canEdit:specialtyWritesEnabled(process.env)&&
        req.bpd.dossierNativeDepartments?.includes(staff.dept)&&canChangeSpecialty(req.bpd,staff),
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
  app.post('/api/personnel/:dept/:discordId/specializations',requireUser,async(req,res)=>{
    if(!specialtyWritesEnabled(process.env))
      return error(res,503,'Specialisatiewijzigingen zijn nog niet geactiveerd');
    let proposal,customLabels;
    try{
      customLabels=await extraSpecialtyLabels(req.params.dept);
      proposal=validateSpecialtyChange(req.body,req.params.dept,customLabels);
    }catch(e){
      if(e.code)return handleError(res,e);
      return error(res,400,e.message);
    }
    try{
      const staff=await subject(req);
      if(!req.bpd.dossierNativeDepartments?.includes(req.params.dept)||!canChangeSpecialty(req.bpd,staff))
        return error(res,403,'Alleen bevoegd officierenkader of korpsleiding kan deze specialisatie wijzigen');
      const ref=getFirestore().collection(PERSONNEL_SPECIALIZATIONS_COLLECTION)
        .doc(staff.dept+'_'+staff.personId);
      const revision=await getFirestore().runTransaction(async tx=>{
        const previous=await tx.get(ref);
        const data=previous.data()||{};
        const current=Number.isSafeInteger(data.revision)?data.revision:0;
        if(current!==proposal.expectedRevision)
          throw failure(409,'De specialisaties zijn intussen gewijzigd. Vernieuw het dossier.');
        const existing=publicSpecializations(staff,data,customLabels).items.find(x=>x.label===proposal.label);
        if(!existing||existing.value===proposal.value)
          throw failure(409,'Geen nieuwe specialisatiestatus om te registreren');
        const values={...(data.values&&typeof data.values==='object'&&!Array.isArray(data.values)
          ?data.values:{})};
        values[proposal.label]={value:proposal.value,source:'manual'};
        tx.set(ref,{dept:staff.dept,discordId:staff.personId,
          revision:current+1,values,updatedAt:FieldValue.serverTimestamp(),
          updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId||null});
        tx.create(ref.collection('audit').doc(),{
          action:'specialization_changed',label:proposal.label,
          previous:existing.value,value:proposal.value,source:'manual',
          reason:proposal.reason,revision:current+1,actorUid:req.bpd.uid,
          actorDiscordId:req.bpd.discordId||null,at:FieldValue.serverTimestamp()
        });
        tx.create(getFirestore().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
          type:'specialization_changed',dept:staff.dept,discordId:staff.personId,
          name:String(staff.name||'Personeelslid').slice(0,120),
          label:proposal.label,before:existing.value,after:proposal.value,
          reason:proposal.reason,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()
        });
        return current+1;
      });
      return res.json({saved:true,revision,source:'manual',discordRoleChanged:false,
        sourceSheetsChanged:false});
    }catch(e){return handleError(res,e)}
  });
}
