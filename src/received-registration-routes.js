import {getFirestore} from 'firebase-admin/firestore';
import {receivedAccess,receivedAuthor} from './received-registration-policy.js';

const discord=id=>/^\d{15,22}$/.test(String(id||''));
const error=(res,status,message)=>res.status(status).json({error:message});
const asIso=v=>v?.toDate?.()?.toISOString?.()||null;
const clip=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const types=new Set(['observatie','sanctie','notitie','activiteit','opleiding',
  'verlof','promotievoorstel','naamswijziging','personeelsbeweging',
  'specialisatiebeperking','functiewijziging']);
export function installReceivedRegistrationRoutes(app,{requireUser,getSnapshot}){
  app.get('/api/personnel/:dept/:discordId/received-records',requireUser,async(req,res)=>{
    const {dept,discordId}=req.params;
    if(dept!=='politie'||!discord(discordId))
      return error(res,400,'Ontvangen registraties zijn momenteel voor politiedossiers beschikbaar');
    try{
      const snap=await getSnapshot();
      if(snap.stale)return error(res,503,'Personeelsbron is tijdelijk niet actueel');
      const people=snap.data.filter(p=>p.dept===dept);
      const matches=people.filter(p=>p.personId===discordId);
      if(matches.length!==1)return error(res,404,'Personeelsfiche niet eenduidig gevonden');
      const allowed=receivedAccess(req.bpd,matches[0]);
      if(!allowed.length)return error(res,403,'Geen recht om ontvangen registraties van dit personeelslid te bekijken');
      const found=await getFirestore().collection('bpd_cases')
        .doc(dept+'_'+discordId).collection('entries')
        .orderBy('createdAt','desc').limit(160).get();
      const grouped={basiskader:[],middenkader:[]};
      for(const doc of found.docs){
        const record=doc.data();
        if(!types.has(record.type))continue;
        const author=receivedAuthor(record,people);
        if(!author||!allowed.includes(author.bucket))continue;
        grouped[author.bucket].push({
          id:doc.id,type:record.type,
          eventDate:clip(record.eventDate,10),eventTime:clip(record.eventTime,6),
          createdAt:asIso(record.createdAt),
          author:{discordId:author.discordId,name:clip(author.name,120),
            call:clip(author.call,30),rank:clip(author.rank,120)},
          details:clip(record.details,4000),
          sanctionType:record.type==='sanctie'?clip(record.sanctionType,120):null,
          severity:record.type==='sanctie'?record.severity:null,
          status:record.type==='sanctie'?clip(record.status,30):null,
          testRecord:record.testRecord===true
        });
      }
      res.set('Cache-Control','private, no-store');
      return res.json({dept,discordId,allowed,groups:{
        basiskader:allowed.includes('basiskader')?grouped.basiskader:null,
        middenkader:allowed.includes('middenkader')?grouped.middenkader:null
      },limited:found.size===160,
      notes:'Indeling op de actuele, geverifieerde personeelsrang van de indiener. Alleen dossiers onder de eigen kaderbevoegdheid zijn zichtbaar.'});
    }catch(e){
      console.error('Ontvangen registraties:',e?.code||e?.message||'onbekende fout');
      return error(res,503,'Ontvangen registraties momenteel niet beschikbaar');
    }
  });
}
