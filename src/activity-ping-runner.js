// Opt-in activity alert processing. No personnel status, Discord roles,
// dismissals, archived records or source spreadsheets are modified here.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {ACTIVITY_COLLECTION,assessActivityPings,automaticPingEntryId,
 activityDateBrussels} from './activity-ping-policy.js';
import {INACTIVITY_PING_NOTICES,inactivityPingNotice}
 from './inactivity-ping-notifications.js';

const SERVICES=new Set(['politie','brandweer','ambulance','depannage']);
const ID=/^\d{15,22}$/;
const MAX_ALERTS_PER_RUN=100;

export function automaticActivityPingsEnabled(env=process.env){
 return env.BPD_ENABLE_ACTIVITY_AUTO_PINGS==='true';
}
const actor=Object.freeze({name:'BelgiumPD activiteitscontrole',
 call:'—',rank:'Systeemcontrole'});

async function storeAutomaticPing(db,person,ping,date){
 const {dept,personId:id}=person,entryId=automaticPingEntryId(dept,id,ping);
 const caseId=dept+'_'+id;
 const entry=db.collection('bpd_cases').doc(caseId).collection('entries').doc(entryId);
 const member=db.collection(INACTIVITY_PING_NOTICES).doc(id)
  .collection('events').doc(entryId);
 const serviceNotice=db.collection('bpd_notices').doc(dept)
  .collection('events').doc(entryId);
 const outcome=await db.runTransaction(async tx=>{
  const existing=await tx.get(entry);
  if(existing.exists)return false;
  const time=FieldValue.serverTimestamp();
  const details='Automatische '+ping.kind+'-ping. '+ping.reason+
   ' Dit is een waarschuwing, geen automatische statuswijziging of ontslag.';
  const source=inactivityPingNotice({
   dept,discordId:id,entryId,details,actor,source:'automatic',kind:ping.kind
  });
  tx.create(entry,{
   type:'inactiviteitsping',reportCategory:'inactiviteitsping',dept,
   eventDate:date,subjectDiscordId:id,
   subjectNameAtCreation:String(person.name||'').slice(0,120),
   subjectCallAtCreation:String(person.call||'').slice(0,24),
   details,registeredBy:actor,source:'automatic_fivem_activity',
   activityPingKind:ping.kind,activityCriterion:ping.criterion,
   activityIncidentKey:ping.incidentKey,activityEvidence:ping.evidence,
   pingNotificationId:entryId,pingNotificationStatus:'sent',
   createdAt:time,modifiedAt:null
  });
  tx.create(member,{...source,createdAt:time,readAt:null});
  tx.create(serviceNotice,{caseId,entryId,type:'inactiviteitsping',dept,
   createdAt:time,source:'automatic_fivem_activity'});
  return true;
 });
 return outcome;
}

export async function runAutomaticActivityPings({getSnapshot,db=getFirestore(),
 env=process.env,now=new Date()}={}){
 if(!automaticActivityPingsEnabled(env))return {enabled:false,created:0};
 const snapshot=await getSnapshot();
 if(snapshot.stale||!Array.isArray(snapshot.data))
  return {enabled:true,skipped:'stale_roster',created:0};
 const people=snapshot.data.filter(p=>SERVICES.has(p?.dept)&&
  ID.test(String(p?.personId||''))&&p.lifecycleState!=='archived');
 const ids=[...new Set(people.map(p=>p.personId))];
 if(ids.length>1500)return {enabled:true,skipped:'roster_limit',created:0};
 const [leaveSnap,checkingSnap]=await Promise.all([
  db.collection('bpd_leave_requests').where('status','==','approved').limit(1500).get(),
  env.BPD_ENABLE_LEAVE_RETURN_CHECKS==='true'
   ?db.collection('bpd_leave_return_checks').where('status','==','CHECKING').limit(501).get()
   :Promise.resolve({docs:[],size:0})
 ]);
 // Failure closed: if the leave result may be truncated, do not issue alerts.
 if(leaveSnap.size===1500)return {enabled:true,skipped:'leave_limit',created:0};
 if(checkingSnap.size>500)return {enabled:true,skipped:'checking_limit',created:0};
 const checking=new Set(checkingSnap.docs.map(doc=>{
  const row=doc.data();return row.dept+':'+row.discordId;
 }));
 const leaves=new Map();
 for(const doc of leaveSnap.docs){
  const row=doc.data(),id=row.personDiscordId;
  if(!ID.test(String(id||'')))continue;
  if(!leaves.has(id))leaves.set(id,[]);
  leaves.get(id).push({status:'approved',startDate:row.startDate,endDate:row.endDate});
 }
 const activity=new Map();
 for(let i=0;i<ids.length;i+=100){
  const records=await db.getAll(...ids.slice(i,i+100).map(id=>
   db.collection(ACTIVITY_COLLECTION).doc(id)));
  for(const record of records)if(record.exists)activity.set(record.id,record.data());
 }
 let created=0,considered=0,skipped=0;
 const date=activityDateBrussels(now);
 for(const p of people){
  // A confirmed post-leave review suppresses automatic follow-up pings.
  if(checking.has(p.dept+':'+p.personId)){skipped++;continue}
  const evidence=activity.get(p.personId);
  if(!evidence||evidence.guildId!==env.DISCORD_GUILD_ID){skipped++;continue}
  const proposed=assessActivityPings(evidence,{
   joinedAt:evidence.joinedAt,leaves:leaves.get(p.personId)||[]
  },now);
  for(const ping of proposed){
   considered++;
   if(created>=MAX_ALERTS_PER_RUN)
    return {enabled:true,created,considered,skipped,limitReached:true};
   if(await storeAutomaticPing(db,p,ping,date))created++;
  }
 }
 return {enabled:true,created,considered,skipped};
}

// A scheduled check only runs on an explicitly enabled server. Repeated
// runs and overlapping instances are safe: the deterministic Firestore
// document ID is atomically reserved in the dossier transaction.
export function scheduleAutomaticActivityPings({getSnapshot,env=process.env}){
 if(!automaticActivityPingsEnabled(env))return null;
 let running=false;
 const tick=async()=>{
  if(running)return;
  running=true;
  try{
   const report=await runAutomaticActivityPings({getSnapshot,env});
   console.info('Automatische FiveM-pings:',JSON.stringify(report));
  }catch(e){
   console.warn('Automatische FiveM-pings niet verwerkt:',e?.code||'controle_mislukt');
  }finally{running=false}
 };
 const initial=setTimeout(()=>void tick(),30000);
 initial.unref?.();
 const every=setInterval(()=>void tick(),6*60*60*1000);
 every.unref?.();
 return {stop:()=>{clearTimeout(initial);clearInterval(every)}};
}
