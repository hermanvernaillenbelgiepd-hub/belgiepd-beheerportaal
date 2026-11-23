// Two personal, private receipts for one leave decision: applicant and
// independently identified manual submitter. This never sends Discord DMs.
import {FieldValue} from 'firebase-admin/firestore';
export const PERSONAL_LEAVE_DECISIONS='bpd_personal_leave_decisions';
const DISCORD=/^\d{15,22}$/;
const DOC=/^[A-Za-z0-9_-]{12,200}$/;
const EVENT=/^[A-Za-z0-9_-]{4,40}$/;
const clean=(input,max=300)=>String(input??'').trim().slice(0,max);
export function leaveDecisionRecipients(request){
 const found=new Map(),applicant=String(request?.personDiscordId||'');
 if(DISCORD.test(applicant))found.set(applicant,'aanvrager');
 const submitter=String(request?.submittedByDiscordId||'');
 if(request?.manual===true&&DISCORD.test(submitter)&&!found.has(submitter))
  found.set(submitter,'handmatige_indiener');
 return [...found].map(([recipientDiscordId,recipientRole])=>({
  recipientDiscordId,recipientRole
 }));
}
export function validPersonalLeaveDecisionId(id){
 if(typeof id!=='string'||id.length>270)return false;
 const m=/^(\d{15,22})_(.+)_([A-Za-z0-9_-]{4,40})$/.exec(id);
 return Boolean(m&&DOC.test(m[2])&&EVENT.test(m[3]));
}
export function stageLeaveDecisionNotifications(tx,{db,requestRef,request,decision,
  decidedBy,note='',eventKey='decision'}){
 if(!DOC.test(requestRef?.id||'')||!EVENT.test(eventKey)||
  !['approved','rejected'].includes(decision))throw Error('Ongeldige verlofbeslissing');
 const base=clean(note,300),at=FieldValue.serverTimestamp(),recipients=leaveDecisionRecipients(request);
 for(const recipient of recipients){
  const id=recipient.recipientDiscordId+'_'+requestRef.id+'_'+eventKey;
  if(!validPersonalLeaveDecisionId(id))throw Error('Ongeldige persoonlijke meldingsreferentie');
  tx.create(db.collection(PERSONAL_LEAVE_DECISIONS).doc(id),{
   recipientDiscordId:recipient.recipientDiscordId,recipientRole:recipient.recipientRole,
   requestId:requestRef.id,decision,eventKey,
   manual:request.manual===true,subjectDiscordId:clean(request.personDiscordId,22),
   subjectName:clean(request.subjectName,120),subjectCall:clean(request.subjectCall,24),
   startDate:clean(request.startDate,10),endDate:clean(request.endDate,10),
   submittedBy:{discordId:clean(request.submittedByDiscordId,22),
    name:clean(request.submittedByActor?.name,120),call:clean(request.submittedByActor?.call,24)},
   decidedBy:{discordId:clean(decidedBy?.discordId,22),name:clean(decidedBy?.name,120),
    call:clean(decidedBy?.call,24)},
   decisionReason:base,createdAt:at,readAt:null,
   source:'leave_request_decision'
  });
 }
 return recipients.length;
}
export function publicLeaveDecision(doc){
 const row=doc.data();
 return {id:doc.id,requestId:row.requestId,
  recipientRole:row.recipientRole,decision:row.decision,eventKey:row.eventKey,
  manual:row.manual===true,subjectName:row.subjectName,subjectCall:row.subjectCall,
  startDate:row.startDate,endDate:row.endDate,submittedBy:row.submittedBy||null,
  decidedBy:row.decidedBy||null,decisionReason:row.decisionReason||'',
  createdAt:row.createdAt?.toDate?.()?.toISOString?.()||null,
  readAt:row.readAt?.toDate?.()?.toISOString?.()||null};
}
