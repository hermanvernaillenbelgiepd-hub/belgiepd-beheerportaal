import {getFirestore} from 'firebase-admin/firestore';
import {dossierScopes,dossierOverviewRows,dossierTimelineEntry} from './dossier-center-policy.js';
import {validPersonnelKey} from './personnel-editor-policy.js';
import {CREATED_PERSONNEL_COLLECTION,personnelDataEnabled} from './personnel-create.js';
import {PERSONNEL_EDITS_COLLECTION} from './personnel-editor-policy.js';

const enabled=()=>process.env.BPD_ENABLE_DOSSIER_CENTER==='true';
const respond=(res,status,message)=>res.status(status).json({error:message});
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
export function installDossierCenterRoutes(app,{requireUser,getSnapshot}){
  // Openbare personeelslijst: alleen publiek zichtbare RP-basisvelden.
  // Discord-identiteit, audit, opleidingen, opmerkingen en rechten nooit openbaar maken.
  app.get('/api/dossiercentrum/public-roster',async(_req,res)=>{
    if(!enabled())return respond(res,503,'Personeelslijst nog niet beschikbaar');
    try{
      const snap=await getSnapshot();
      const rows=snap.data.filter(p=>validPersonnelKey(p.dept,p.personId))
        .map(p=>({
          dept:p.dept,name:String(p.name||'').slice(0,120),
          call:String(p.call||'').slice(0,24),rank:String(p.rank||'').slice(0,80),
          status:String(p.status||'').slice(0,50),personnel:true
        })).sort((a,b)=>a.dept.localeCompare(b.dept,'nl')||
          a.call.localeCompare(b.call,'nl',{numeric:true}));
      return res.json({rows,sourceStale:snap.stale===true,public:true});
    }catch(e){return failed(res,e)}
  });
  app.get('/api/dossiercentrum/status',(_req,res)=>
    res.json({enabled:enabled(),readOnly:true,personnelOnly:true}));
  app.get('/api/dossiercentrum/overview',requireUser,async(req,res)=>{
    if(!enabled())return respond(res,503,'Het dossiercentrum is nog niet geactiveerd');
    const scopes=dossierScopes(req.bpd);
    if(!scopes.personnelDepartments.length)
      return respond(res,403,'Geen toegelaten personeelsdossiers voor dit account');
    try{
      const snap=await getSnapshot();
      const personnel=snap.data.filter(p=>scopes.personnelDepartments.includes(p.dept));
      const rows=dossierOverviewRows(personnel,[],scopes);
      return res.json({rows,departments:scopes.personnelDepartments,
        burgerCanWrite:process.env.BPD_ENABLE_BURGER_DOSSIER_WRITES==='true'&&
          req.bpd?.burgerDossierAccess?.write===true,
        sourceStale:snap.stale===true,readOnly:true});
    }catch(e){return failed(res,e)}
  });
  app.get('/api/dossiercentrum/:dept/:discordId',requireUser,async(req,res)=>{
    if(!enabled())return respond(res,503,'Het dossiercentrum is nog niet geactiveerd');
    const {dept,discordId}=req.params;
    if(!validPersonnelKey(dept,discordId))return respond(res,400,'Ongeldig personeelsdossier');
    if(!dossierScopes(req.bpd).personnelDepartments.includes(dept))
      return respond(res,403,'Geen personeelsrechten voor deze hulpdienst');
    try{
      const snap=await getSnapshot();
      const matches=snap.data.filter(p=>p.dept===dept&&p.personId===discordId);
      if(matches.length>1)return respond(res,409,'Dubbele personeelsidentiteit; administratieve controle nodig');
      const p=matches[0];
      if(!p)return respond(res,404,'Geen personeelsfiche gevonden');
      const db=getFirestore();
      const histories=[
        timeline(db.collection(PERSONNEL_EDITS_COLLECTION).doc(dept+'_'+discordId),'personeel')
      ];
      if(p.createdInFirestore===true&&personnelDataEnabled(process.env))
        histories.push(timeline(db.collection(CREATED_PERSONNEL_COLLECTION)
          .doc(dept+'_'+discordId),'loopbaan'));
      const timelineEntries=(await Promise.all(histories)).flat()
        .sort((a,b)=>(b.at||'').localeCompare(a.at||'')).slice(0,50);
      return res.json({dept,discordId,readOnly:true,personnel:publicPerson(p),timeline:timelineEntries});
    }catch(e){return failed(res,e)}
  });
}
