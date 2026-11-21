import {getFirestore} from 'firebase-admin/firestore';
import {dossierScopes,dossierOverviewRows,dossierTimelineEntry} from './dossier-center-policy.js';
import {validPersonnelKey,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {isVerifiedReportCorpsReader} from './fortnight-report-policy.js';
import {CREATED_PERSONNEL_COLLECTION,personnelDataEnabled} from './personnel-create.js';
import {PERSONNEL_EDITS_COLLECTION} from './personnel-editor-policy.js';
import {policeOfficialRankLabel} from './personnel-rank-policy.js';

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
  return {dept:p.dept,discordId:p.personId,name:p.name,call:p.call,
    rank:p.dept==='politie'?policeOfficialRankLabel(p.rank):p.rank,
    status:p.status,source:p.source||'google-sheets'};
}
export function installDossierCenterRoutes(app,{requireUser,getSnapshot}){
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
      const rows=dossierOverviewRows(personnel,[],scopes).map(row=>({
        ...row,
        verifiedFunction:row.dept==='depannage'&&row.discordId?
          req.bpd.depannageSubjectFunctions?.[row.discordId]||null:null
      }));
      return res.json({rows,departments:scopes.personnelDepartments,
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
      if(!canReadPersonnelSubject(req.bpd,p))return respond(res,403,'Dossier van Korpsleiding is afgeschermd');
      // Brandweer Middenkader/leiding sees a narrowly scoped identity only;
      // personnel timelines can contain confidential decisions and are suppressed.
      if(dept==='brandweer'&&!isVerifiedReportCorpsReader(req.bpd)&&
          req.bpd.fireZoneChief!==true&&req.bpd.boardPersonnelAdmin!==true)
        return res.json({dept,discordId,readOnly:true,
          personnel:publicPerson(p),timeline:[],fireDossier:true});
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
