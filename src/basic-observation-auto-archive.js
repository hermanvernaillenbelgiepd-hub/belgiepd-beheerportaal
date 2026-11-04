// Automatic retention for separate Police Basiskader observations.
// Individual submissions move to the secure archive 30 * 24 hours after
// their original server-side createdAt timestamp. No records are deleted.
// A deliberate manual restore opens a fresh 30-day follow-up period.
import {getFirestore,FieldValue,Timestamp} from 'firebase-admin/firestore';
import {loadTechnicalSettings} from './technical-center-config.js';

export const BASIC_OBSERVATION_RETENTION_DAYS=30;
export const BASIC_OBSERVATION_RETENTION_MS=30*24*60*60*1000;
export const BASIC_OBSERVATION_SYSTEM_ACTOR='system:basic-observations-retention';
const COLLECTION='bpd_basic_observations';
const AUDIT='bpd_basic_observation_audit';
const PAGE_SIZE=150;
const MAX_SCAN=6000;
const INTERVAL_MS=60*60*1000;
const millis=value=>{
 if(value?.toMillis)return value.toMillis();
 if(value instanceof Date)return value.getTime();
 return null;
};

export function basicObservationDueAt(entry,retentionDays=BASIC_OBSERVATION_RETENTION_DAYS){
 const created=millis(entry?.createdAt);
 if(!Number.isFinite(created))return null;
 const restored=millis(entry?.restoredAt);
 const anchor=Number.isFinite(restored)&&restored>created?restored:created;
 return anchor+retentionDays*24*60*60*1000;
}

export function shouldAutoArchiveBasicObservation(entry,now=Date.now(),retentionDays=BASIC_OBSERVATION_RETENTION_DAYS){
 const due=basicObservationDueAt(entry,retentionDays);
 return entry?.type==='observatie'&&entry?.dept==='politie'&&
   entry?.archivedAt==null&&Number.isFinite(due)&&due<=now;
}

// Firestore transaction makes overlapping server instances and retries safe:
// a record can acquire archivedAt and an audit entry at most once per archival
// transition. Manually archived observations and fresh restores are skipped.
export async function runBasicObservationAutoArchive({
 db=getFirestore(),now=new Date(),maxScan=MAX_SCAN,
 retentionDays=BASIC_OBSERVATION_RETENTION_DAYS
}={}){
 if(!Number.isSafeInteger(retentionDays)||retentionDays<7||retentionDays>365)
   throw Error('Ongeldige bewaartermijn; geen archivering uitgevoerd');
 const nowMs=now instanceof Date?now.getTime():Number(now);
 if(!Number.isFinite(nowMs))throw Error('Ongeldige archiveringstijd');
 const scanLimit=Math.min(Math.max(1,Math.floor(maxScan)),MAX_SCAN);
 const cutoff=Timestamp.fromMillis(nowMs-retentionDays*24*60*60*1000);
 const col=db.collection(COLLECTION);
 let last=null,scanned=0,archived=0,finished=false,skipped=0;
 while(scanned<scanLimit){
   let query=col.orderBy('createdAt','asc').endAt(cutoff)
     .limit(Math.min(PAGE_SIZE,scanLimit-scanned));
   if(last)query=query.startAfter(last);
   const page=await query.get();
   if(page.empty){finished=true;break}
   for(const record of page.docs){
     scanned++;
     if(!shouldAutoArchiveBasicObservation(record.data(),nowMs,retentionDays)){skipped++;continue}
     const didArchive=await db.runTransaction(async tx=>{
       const current=await tx.get(record.ref);
       if(!current.exists||
         !shouldAutoArchiveBasicObservation(current.data(),nowMs,retentionDays))return false;
       const at=FieldValue.serverTimestamp();
       tx.update(record.ref,{archivedAt:at,archivedBy:BASIC_OBSERVATION_SYSTEM_ACTOR,
         archiveReason:'automatic_'+retentionDays+'_days',modifiedAt:at});
       tx.create(db.collection(AUDIT).doc(),{
         observationId:record.id,action:'auto_archive',
         subjectDiscordId:String(current.get('subjectDiscordId')||''),
         actorUid:BASIC_OBSERVATION_SYSTEM_ACTOR,retentionDays,
         submittedAt:current.get('createdAt'),at
       });
       return true;
     });
     if(didArchive)archived++;else skipped++;
   }
   last=page.docs[page.docs.length-1];
   if(page.size<Math.min(PAGE_SIZE,scanLimit-scanned+page.size)){
     finished=true;break;
   }
 }
 return {scanned,archived,skipped,complete:finished,limitReached:!finished,
  retentionDays};
}

// Enabled by default. BPD_DISABLE_BASIC_OBSERVATION_AUTO_ARCHIVE=true is an
// emergency pause only; there is no dependency on activity-ping settings.
export function scheduleBasicObservationAutoArchive({
 env=process.env,run=runBasicObservationAutoArchive,
 readSettings=loadTechnicalSettings
}={}){
 if(env.BPD_DISABLE_BASIC_OBSERVATION_AUTO_ARCHIVE==='true')return null;
 let running=false;
 const tick=async()=>{
   if(running)return;
   running=true;
   try{
     // Reload the CURRENT saved settings before each hourly cycle. Fail closed
     // on unavailable Firebase rather than silently falling back to 30 days.
     const config=await readSettings();
     if(config.observationArchiveEnabled!==true)return;
     const summary=await run({retentionDays:config.observationArchiveDays});
     console.info('Basiskader-observaties automatische archivering:',
       JSON.stringify(summary));
   }catch(error){
     console.warn('Automatische Basiskader-archivering mislukt:',
       typeof error?.code==='string'?error.code.slice(0,60):'controle_mislukt');
   }finally{running=false}
 };
 const initial=setTimeout(()=>void tick(),45000);
 initial.unref?.();
 const interval=setInterval(()=>void tick(),INTERVAL_MS);
 interval.unref?.();
 return {stop:()=>{clearTimeout(initial);clearInterval(interval)}};
}
