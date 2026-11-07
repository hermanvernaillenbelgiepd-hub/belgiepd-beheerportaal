import {getFirestore} from 'firebase-admin/firestore';
import {dossierScopes} from './dossier-center-policy.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {loadSubjectCheckrides} from './checkride-dossier-history.js';
const ID=/^\\d{15,22}$/;
const SERVICES=new Set(['politie','ambulance','brandweer','depannage']);
export function installCheckrideDossierRoutes(app,{requireUser,getSnapshot}){
  app.get('/api/checkrides/dossier/:dept/:discordId',requireUser,async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    const {dept,discordId}=req.params,actor=req.bpd;
    if(!SERVICES.has(dept)||!ID.test(discordId))
      return res.status(400).json({error:'Ongeldige dienstdossierverwijzing'});
    if(!dossierScopes(actor).personnelDepartments.includes(dept))
      return res.status(403).json({error:'Geen dossierrechten voor deze hulpdienst'});
    // Fire middle cadre may view identity/observations but NOT private training
    // assessments. Fire leadership/zone, Board and technical admin may read them.
    if(dept==='brandweer'&&!(actor.fireZoneChief===true||
      actor.fireAccessLevel==='leadership'||actor.boardPersonnelAdmin===true||
      actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true))
      return res.status(403).json({error:'Stage-evaluaties alleen voor Brandweerleiding'});
    try{
      const snapshot=await getSnapshot();
      if(snapshot?.stale||!Array.isArray(snapshot?.data))
        return res.status(503).json({error:'Personeelsgegevens zijn niet actueel'});
      const matches=snapshot.data.filter(p=>p?.dept===dept&&p.personId===discordId);
      if(matches.length!==1)return res.status(matches.length?409:404)
        .json({error:'Geen eenduidige personeelsfiche voor deze hulpdienst'});
      if(!canReadPersonnelSubject(actor,matches[0]))
        return res.status(403).json({error:'Dit personeelsdossier is afgeschermd'});
      const history=await loadSubjectCheckrides(getFirestore(),dept,discordId);
      res.json({department:dept,discordId,...history});
    }catch(e){
      console.error('Koppelrit-dossierinzage:',e?.code||'opslagfout');
      return res.status(503).json({error:'Evaluatiehistoriek tijdelijk niet beschikbaar'});
    }
  });
}
