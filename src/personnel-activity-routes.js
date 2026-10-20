import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {canViewPersonnel,canEditPersonnel} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {CREATED_PERSONNEL_COLLECTION} from './personnel-create.js';
import {PERSONNEL_ACTIVITY_COLLECTION,recentPersonnelActivity,validateRetrospectiveCallChange} from './personnel-activity.js';

const DEPARTMENTS=['politie','ambulance','brandweer','depannage'];
const mayLogPreviousCall=actor=>/^(?:officierenkader|korpsleiding)$/.test(actor?.role||'')&&
  ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'))&&
  /^\d{15,22}$/.test(actor?.discordId||'')&&
  actor.departments?.includes('politie');
export function installPersonnelActivityRoutes(app,{requireUser,getSnapshot}){
  app.get('/api/personnel/activity/recent',requireUser,async(req,res)=>{
    const permitted=DEPARTMENTS.filter(dept=>canViewPersonnel(req.bpd,dept));
    if(!permitted.length)return res.status(403).json({error:'Geen bevoegdheid voor personeelsactiviteiten'});
    try{
      const db=getFirestore();
      // Only verified, final records; pending/failed fixed calls are never shown.
      // Single-field ordered queries avoid relying on collection-group indexes.
      const [audits,callsigns,created]=await Promise.all([
        db.collection(PERSONNEL_ACTIVITY_COLLECTION).orderBy('at','desc').limit(60).get(),
        permitted.includes('politie')
          ?db.collection('bpd_callsign_requests').orderBy('syncedAt','desc').limit(60).get()
          :Promise.resolve({docs:[]}),
        permitted.includes('politie')
          ?db.collection(CREATED_PERSONNEL_COLLECTION).orderBy('rankUpdatedAt','desc').limit(35).get()
          :Promise.resolve({docs:[]})
      ]);
      const events=recentPersonnelActivity(audits.docs,callsigns.docs,permitted,8,created.docs);
      res.set('Cache-Control','no-store');
      return res.json({events,readOnly:true,canLogHistoricalCall:process.env.BPD_ENABLE_HISTORICAL_CALL_AUDIT_WRITES==='true'&&mayLogPreviousCall(req.bpd),
        note:'Alleen gelogde personeelswijzigingen; handmatige Sheets-wijzigingen zonder historiek worden niet terugwerkend gereconstrueerd.'});
    }catch(err){
      console.error('Recente personeelsactiviteiten:',err?.code||err?.message||'onbekend');
      return res.status(503).json({error:'Recente personeelsactiviteiten tijdelijk niet beschikbaar'});
    }
  });

  // A historical Sheet change has no trustworthy occurrence date: store the
  // date of its manual registration, never silently claim it occurred today.
  app.post('/api/personnel/activity/retrospective-callsign',requireUser,async(req,res)=>{
    if(process.env.BPD_ENABLE_HISTORICAL_CALL_AUDIT_WRITES!=='true')
      return res.status(503).json({error:'Historische roepnummerregistratie is uitgeschakeld'});
    if(!mayLogPreviousCall(req.bpd))
      return res.status(403).json({error:'Alleen bevoegd officierenkader of korpsleiding Politie mag dit registreren'});
    let entry;
    try{entry=validateRetrospectiveCallChange(req.body)}
    catch(e){return res.status(400).json({error:e.message})}
    try{
      const snapshot=await getSnapshot({forceRefresh:true});
      if(snapshot.stale)return res.status(503).json({error:'De actuele personeelsbron kon niet worden geverifieerd'});
      const matches=snapshot.data.filter(p=>p.dept==='politie'&&p.personId===entry.discordId);
      if(matches.length!==1)return res.status(404).json({error:'Geen eenduidige politionele personeelsfiche'});
      const person=matches[0];
      if(!canEditPersonnel(req.bpd,person))
        return res.status(403).json({error:'Geen wijzigingsrecht op dit personeelsdossier'});
      if(person.call.toLocaleLowerCase('nl-BE')!==entry.expectedCurrentCall.toLocaleLowerCase('nl-BE'))
        return res.status(409).json({error:'Het roepnummer in de personeelslijst is intussen anders. Vernieuw het dashboard.'});
      if(entry.recordPromotion&&person.rank!==entry.expectedCurrentRank)
        return res.status(409).json({error:'De actuele rang in de personeelslijst komt niet overeen. Vernieuw het dashboard.'});
      // A manual attestation is not proof of an earlier grade. No invented prior
      // rank or occurrence date; both records are committed atomically.
      const store=getFirestore();
      const events=store.collection(PERSONNEL_ACTIVITY_COLLECTION);
      const key=[person.dept,person.personId,entry.previousCall.toLowerCase(),person.call.toLowerCase()].join('|');
      const callRef=events.doc('historical_call_'+createHash('sha256').update(key).digest('hex'));
      const rankKey=[person.dept,person.personId,person.rank.toLowerCase()].join('|');
      const promotionRef=entry.recordPromotion
        ?events.doc('historical_promotion_'+createHash('sha256').update(rankKey).digest('hex')):null;
      let recorded;
      try{
        recorded=await store.runTransaction(async tx=>{
          const callAlready=await tx.get(callRef);
          const rankAlready=promotionRef?await tx.get(promotionRef):null;
          const callNew=!callAlready.exists,rankNew=!!promotionRef&&!rankAlready.exists;
          if(!callNew&&!rankNew)
            throw Object.assign(new Error('Deze personeelswijzigingen zijn al geregistreerd'),{publicStatus:409});
          const base={dept:'politie',discordId:person.personId,name:person.name,
            source:'retrospective_manual',reason:entry.reason,
            actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
            at:FieldValue.serverTimestamp(),actualChangeDate:null};
          if(callNew)tx.create(callRef,{...base,type:'callsign_changed',
            before:entry.previousCall,after:person.call});
          if(rankNew)tx.create(promotionRef,{...base,type:'promotion',
            before:'',after:person.rank});
          return {callNew,rankNew};
        });
      }catch(err){
        if(err?.publicStatus)return res.status(err.publicStatus).json({error:err.message});
        if(err?.code===6||err?.code==='already-exists')
          return res.status(409).json({error:'De wijziging is intussen geregistreerd; vernieuw het dashboard'});
        throw err;
      }
      return res.status(201).json({recorded:true,recordedAt:'server',
        recordedCall:recorded.callNew,recordedPromotion:recorded.rankNew,
        currentRosterUnchanged:true,occurrenceDateUnknown:true});
    }catch(err){
      console.error('Historische roepnummerregistratie:',err?.code||err?.message||'onbekend');
      return res.status(503).json({error:'Historische roepnummerregistratie is momenteel niet beschikbaar'});
    }
  });
}
