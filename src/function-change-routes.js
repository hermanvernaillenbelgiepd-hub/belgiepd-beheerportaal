import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canReadServiceDossier} from './service-dossier-access.js';
import {actorFromPersonnel} from './registrations.js';
import {validPersonnelKey} from './personnel-editor-policy.js';
import {functionalRoles,verifiedFunctionalRoleIds,canRecordFunctionChange,
  validateFunctionChange,applyFunctionChange,describeFunctionChange} from './function-change-policy.js';

const COLLECTION='bpd_personnel_functions';
const invalid=(res,status,message)=>res.status(status).json({error:message});
const fmtTime=x=>x?.toDate?.()?.toISOString?.()||null;
const entryDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const errorResult=(res,e)=>{
  if(e?.status)return invalid(res,e.status,e.message);
  console.error('Functiewijziging:',e?.code||e?.message||'onbekende fout');
  return invalid(res,503,'Functieregistratie is tijdelijk niet beschikbaar');
};
function statusError(status,message){return Object.assign(new Error(message),{status})}
export function installFunctionChangeRoutes(app,{requireUser,getSnapshot}){
  async function subject(req){
    const {dept,discordId}=req.params;
    if(!validPersonnelKey(dept,discordId))
      throw statusError(400,'Ongeldige personeelsreferentie');
    if(!canReadServiceDossier(req.bpd,dept))
      throw statusError(403,'Geen dossiertoegang tot deze hulpdienst');
    const snapshot=await getSnapshot();
    if(snapshot.stale)throw statusError(503,'Personeelsbron is tijdelijk niet actueel');
    const people=snapshot.data.filter(p=>p.dept===dept&&p.personId===discordId);
    if(people.length!==1)throw statusError(404,'Personeelsfiche niet eenduidig gevonden');
    return {person:people[0],people:snapshot.data};
  }
  const refFor=(dept,id)=>getFirestore().collection(COLLECTION).doc(dept+'_'+id);
  app.get('/api/personnel/:dept/:discordId/functions',requireUser,async(req,res)=>{
    try{
      const {dept,discordId}=req.params,{person}=await subject(req);
      const ref=refFor(dept,discordId),memberRef=getFirestore().collection('bpd_discord_auth').doc(discordId);
      const [record,member,history]=await Promise.all([
        ref.get(),memberRef.get(),ref.collection('audit').orderBy('at','desc').limit(40).get()
      ]);
      const checked=verifiedFunctionalRoleIds(member.data(),dept,process.env.DISCORD_GUILD_ID);
      const stored=record.data();
      const internal=stored?.initialized===true&&Array.isArray(stored.roles)?
        stored.roles.filter(role=>functionalRoles(dept).some(item=>item.id===role)):
        checked||[];
      const options=functionalRoles(dept);
      const map=ids=>ids.map(id=>options.find(item=>item.id===id)).filter(Boolean);
      res.set('Cache-Control','private, no-store');
      return res.json({dept,revision:Number.isSafeInteger(stored?.revision)?stored.revision:0,
        roles:map(internal),discordRoles:checked===null?null:map(checked),
        internallyRecorded:stored?.initialized===true,
        canEdit:canRecordFunctionChange(req.bpd,person),options,
        history:history.docs.map(doc=>{
          const x=doc.data();
          return {action:x.action||'functiewijziging',
            from:String(x.from||'Geen').slice(0,120),
            to:String(x.to||'Geen').slice(0,120),
            reason:String(x.reason||'').slice(0,500),
            at:fmtTime(x.at),by:x.by?{name:String(x.by.name||'Onbekend').slice(0,120),
              call:String(x.by.call||'').slice(0,40)}:{name:'Onbekend',call:''}};
        }),historyLimited:history.size===40,
        disclaimer:'Functieregistratie in het portaal. Bestaande Discord-rollen en personeels-/toegangsrechten worden niet automatisch gewijzigd.'});
    }catch(e){return errorResult(res,e)}
  });
  app.post('/api/personnel/:dept/:discordId/functions',requireUser,async(req,res)=>{
    const {dept,discordId}=req.params;
    let change;
    try{change=validateFunctionChange(req.body,dept)}
    catch(e){return invalid(res,400,e.message)}
    try{
      const {person,people}=await subject(req);
      if(!canRecordFunctionChange(req.bpd,person))
        return invalid(res,403,'Functiewijziging uitsluitend door bevoegd Officierenkader of Korpsleiding van deze dienst');
      const actor=actorFromPersonnel(req.bpd,people);
      if(!actor)return invalid(res,403,'Eigen personeelsidentiteit moet gekoppeld zijn om een functie te wijzigen');
      const store=getFirestore(),ref=refFor(dept,discordId);
      const memberRef=store.collection('bpd_discord_auth').doc(discordId);
      const activity=ref.collection('audit').doc();
      const caseEntry=store.collection('bpd_cases').doc(dept+'_'+discordId).collection('entries').doc();
      const notification=store.collection('bpd_notices').doc(dept).collection('events').doc();
      const date=entryDate();
      const result=await store.runTransaction(async tx=>{
        // Firestore requires all reads to precede any writes.
        const [existing,member]=await Promise.all([tx.get(ref),tx.get(memberRef)]);
        const saved=existing.data();
        const revision=Number.isSafeInteger(saved?.revision)?saved.revision:0;
        if(revision!==change.expectedRevision)
          throw statusError(409,'Functies zijn intussen gewijzigd. Vernieuw eerst de personeelsfiche.');
        const baseline=verifiedFunctionalRoleIds(member.data(),dept,process.env.DISCORD_GUILD_ID);
        const current=saved?.initialized===true&&Array.isArray(saved.roles)?
          saved.roles.filter(id=>functionalRoles(dept).some(x=>x.id===id)):baseline||[];
        let updated;
        try{updated=applyFunctionChange(current,change)}
        catch(e){throw statusError(409,e.message)}
        const names=describeFunctionChange(change);
        const now=FieldValue.serverTimestamp();
        tx.set(ref,{dept,discordId,initialized:true,roles:updated,
          revision:revision+1,updatedAt:now,updatedByDiscordId:req.bpd.discordId||null});
        tx.create(activity,{action:'functiewijziging',from:names.from,to:names.to,
          fromRoleId:change.previousRoleId,toRoleId:change.newRoleId,
          reason:change.reason,revision:revision+1,at:now,
          by:actor,actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null});
        const details=names.description+'. Motivering: '+change.reason;
        tx.create(caseEntry,{type:'functiewijziging',reportCategory:'functiewijziging',
          dept,subjectDiscordId:discordId,subjectNameAtCreation:person.name,
          subjectCallAtCreation:person.call,eventDate:date,
          details,previousFunction:names.from,newFunction:names.to,
          functionAction:change.action,reason:change.reason,
          registeredBy:actor,submittedBy:{uid:req.bpd.uid,email:req.bpd.email},
          createdAt:now,modifiedAt:null,source:'personnel-function-change'});
        tx.create(notification,{caseId:dept+'_'+discordId,entryId:caseEntry.id,
          type:'functiewijziging',dept,createdAt:now});
        return {revision:revision+1,from:names.from,to:names.to};
      });
      return res.json({saved:true,...result,weekReportLogged:true,
        discordRoleChanged:false,portalAccessChanged:false});
    }catch(e){return errorResult(res,e)}
  });
}
