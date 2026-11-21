// Append-only, content-addressed copies of completed automatic weekreports.
// A manifest is created only AFTER all compressed chunks were persisted.
// Later dossier edits, restarts or report removal markers never change a copy.
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Timestamp} from 'firebase-admin/firestore';
import {parseAutomaticReportId} from './fortnight-report-policy.js';

export const WEEKREPORT_ARCHIVE_COLLECTION='bpd_weekreport_snapshots';
const CHUNK_BYTES=256*1024;
const MAX_RAW_BYTES=24*1024*1024;
const MAX_COMPRESSED_BYTES=8*1024*1024;
const MAX_CHUNKS=32;
const sha=value=>createHash('sha256').update(value).digest('hex');
const validNow=now=>now instanceof Date&&Number.isFinite(now.valueOf());
const isConflict=err=>err?.code===6||err?.code==='already-exists';
export const brusselsReportDay=(now=new Date())=>{
 if(!validNow(now))throw Error('Ongeldige rapporttijd');
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
   year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
};
const nextCalendarDay=s=>{
 const ms=Date.parse(s+'T00:00:00Z');
 return Number.isFinite(ms)?new Date(ms+86400000).toISOString().slice(0,10):null;
};
export function archiveCaptureKind(report,day){
 if(!report||report.source!=='automatic'||!parseAutomaticReportId(report.id)||
    report.periodEnd>=day)throw Error('Enkel afgesloten automatische rapporten mogen vastgezet worden');
 return nextCalendarDay(report.periodEnd)===day?
  'automatisch_na_afsluiting':'retrospectief_vastgezet';
}
export function validateArchivePayload(payload,day){
 if(!payload?.report||!Array.isArray(payload.sections)||
    payload.report.source!=='automatic'||payload.report.status!=='afgesloten_periode'||
    !Number.isSafeInteger(payload.recordCount)||payload.recordCount<0||
    payload.truncated!==false)
   throw Error('Onvolledig rapport: geen archiefkopie aangemaakt');
 const parsed=parseAutomaticReportId(payload.report.id);
 if(!parsed||parsed.dept!==payload.report.dept||
    parsed.periodStart!==payload.report.periodStart||
    parsed.periodEnd!==payload.report.periodEnd||parsed.periodEnd>=day)
   throw Error('Rapportperiode komt niet overeen met automatisch rapport');
 return true;
}
export function encodeArchivePayload(payload,day){
 validateArchivePayload(payload,day);
 const cleaned={...payload,canExport:false,archiveInfo:undefined};
 const json=Buffer.from(JSON.stringify(cleaned),'utf8');
 if(json.length>MAX_RAW_BYTES)throw Error('Archief te groot om veilig te bewaren');
 const compressed=gzipSync(json,{level:9});
 if(compressed.length>MAX_COMPRESSED_BYTES)throw Error('Archief te groot; niets overschreven');
 const chunks=[];
 for(let i=0;i<compressed.length;i+=CHUNK_BYTES)
   chunks.push(compressed.subarray(i,i+CHUNK_BYTES).toString('base64'));
 if(chunks.length>MAX_CHUNKS)throw Error('Te veel archiefdelen');
 return {chunks,sha256:sha(json),compressedSha256:sha(compressed),
   rawBytes:json.length,compressedBytes:compressed.length};
}
export function decodeArchivePayload(chunks,manifest){
 if(!Array.isArray(chunks)||chunks.length!==manifest?.chunkCount||
    chunks.length<1||chunks.length>MAX_CHUNKS)
   throw Error('Onvolledige archiefkopie');
 const zipped=Buffer.concat(chunks.map(c=>Buffer.from(c,'base64')));
 if(zipped.length!==manifest.compressedBytes||zipped.length>MAX_COMPRESSED_BYTES||
    sha(zipped)!==manifest.compressedSha256)throw Error('Archiefcontrole mislukt');
 const json=gunzipSync(zipped,{maxOutputLength:MAX_RAW_BYTES});
 if(json.length!==manifest.rawBytes||sha(json)!==manifest.sha256)
   throw Error('Archiefchecksum komt niet overeen');
 const body=JSON.parse(json.toString('utf8'));
 validateArchivePayload(body,manifest.captureDay);
 if(body.report.id!==manifest.reportId||body.report.dept!==manifest.dept)
   throw Error('Archiefidentiteit komt niet overeen');
 return body;
}
export function archiveNotice(manifest){
 const captured=typeof manifest.capturedAt==='string'?manifest.capturedAt:'onbekend';
 return manifest.captureKind==='retrospectief_vastgezet'?
  'RETROSPECTIEF VASTGEZET op '+captured+
  '. Deze historische reconstructie gebruikt de toen beschikbare dossiergegevens; zij bewijst niet welke gegevens exact op de oorspronkelijke sluitingsdatum aanwezig waren. Sinds het vastzetten is deze kopie onveranderlijk.':
  'AUTOMATISCH VASTGEZET op '+captured+
  '. Kopie genomen na het einde van de rapportperiode, uit de toen beschikbare dossiergegevens. Latere wijzigingen in dossiers veranderen deze kopie niet.';
}
export async function saveAutomaticWeekReportSnapshot({
 db,payload,now=new Date(),storeCollection=WEEKREPORT_ARCHIVE_COLLECTION
}){
 const day=brusselsReportDay(now);
 const captureKind=archiveCaptureKind(payload.report,day);
 const packed=encodeArchivePayload(payload,day);
 const ref=db.collection(storeCollection).doc(payload.report.id);
 const existing=await ref.get();
 if(existing.exists)return {created:false,reportId:payload.report.id};
 const generationId=randomUUID();
 const generation=ref.collection('generations').doc(generationId);
 // Distinct generation paths prevent overlapping instances from rewriting
 // each other's uncommitted chunks. Only the winning manifest is readable.
 for(let i=0;i<packed.chunks.length;i+=8){
   await Promise.all(packed.chunks.slice(i,i+8).map((part,j)=>
     generation.collection('chunks').doc(String(i+j).padStart(4,'0'))
       .create({index:i+j,data:part})));
 }
 const manifest={reportId:payload.report.id,dept:payload.report.dept,
   periodStart:payload.report.periodStart,periodEnd:payload.report.periodEnd,
   source:'automatic',schemaVersion:1,immutable:true,
   captureKind,captureDay:day,capturedAt:now.toISOString(),
   serverCapturedAt:Timestamp.fromDate(now),generationId,
   chunkCount:packed.chunks.length,rawBytes:packed.rawBytes,
   compressedBytes:packed.compressedBytes,sha256:packed.sha256,
   compressedSha256:packed.compressedSha256};
 try{await ref.create(manifest)}
 catch(err){if(isConflict(err))return {created:false,reportId:payload.report.id};throw err}
 return {created:true,reportId:payload.report.id,captureKind};
}
export async function readAutomaticWeekReportSnapshot({
 db,id,storeCollection=WEEKREPORT_ARCHIVE_COLLECTION
}){
 if(!parseAutomaticReportId(id))return null;
 const ref=db.collection(storeCollection).doc(id),document=await ref.get();
 if(!document.exists)return null;
 const manifest=document.data();
 if(!manifest?.immutable||manifest.schemaVersion!==1||
    !/^[0-9a-f-]{36}$/.test(String(manifest.generationId||'')))
   throw Error('Ongeldige archiefmanifest');
 const collection=ref.collection('generations').doc(manifest.generationId)
   .collection('chunks');
 const refs=Array.from({length:manifest.chunkCount},(_,i)=>
   collection.doc(String(i).padStart(4,'0')));
 if(!refs.length||refs.length>MAX_CHUNKS)throw Error('Ongeldig aantal archiefdelen');
 const chunks=[];
 for(let i=0;i<refs.length;i+=20){
   const docs=await db.getAll(...refs.slice(i,i+20));
   for(const doc of docs){
     if(!doc.exists||typeof doc.get('data')!=='string')
       throw Error('Ontbrekend archiefdeel');
     chunks.push(doc.get('data'));
   }
 }
 const payload=decodeArchivePayload(chunks,manifest);
 return {...payload,archiveInfo:{
   kind:manifest.captureKind,capturedAt:manifest.capturedAt,
   sha256:manifest.sha256,immutable:true
 },disclaimer:archiveNotice(manifest)};
}
