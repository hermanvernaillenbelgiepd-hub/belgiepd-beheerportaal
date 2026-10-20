import {getFirestore} from 'firebase-admin/firestore';
import {canViewPersonnel} from './personnel-editor-policy.js';
import {PERSONNEL_ACTIVITY_COLLECTION,recentPersonnelActivity} from './personnel-activity.js';

const DEPARTMENTS=['politie','ambulance','brandweer','depannage'];
export function installPersonnelActivityRoutes(app,{requireUser}){
  app.get('/api/personnel/activity/recent',requireUser,async(req,res)=>{
    const permitted=DEPARTMENTS.filter(dept=>canViewPersonnel(req.bpd,dept));
    if(!permitted.length)return res.status(403).json({error:'Geen bevoegdheid voor personeelsactiviteiten'});
    try{
      const db=getFirestore();
      // Only verified, final records; pending/failed fixed calls are never shown.
      // Single-field ordered queries avoid relying on collection-group indexes.
      const [audits,callsigns]=await Promise.all([
        db.collection(PERSONNEL_ACTIVITY_COLLECTION).orderBy('at','desc').limit(60).get(),
        permitted.includes('politie')
          ?db.collection('bpd_callsign_requests').orderBy('syncedAt','desc').limit(60).get()
          :Promise.resolve({docs:[]})
      ]);
      const events=recentPersonnelActivity(audits.docs,callsigns.docs,permitted,8);
      res.set('Cache-Control','no-store');
      return res.json({events,readOnly:true,
        note:'Alleen gelogde personeelswijzigingen; handmatige Sheets-wijzigingen zonder historiek worden niet terugwerkend gereconstrueerd.'});
    }catch(err){
      console.error('Recente personeelsactiviteiten:',err?.code||err?.message||'onbekend');
      return res.status(503).json({error:'Recente personeelsactiviteiten tijdelijk niet beschikbaar'});
    }
  });
}
