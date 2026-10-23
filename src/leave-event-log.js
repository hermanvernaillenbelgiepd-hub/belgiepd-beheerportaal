import {getFirestore,FieldValue} from 'firebase-admin/firestore';
// Leave decisions are immutable audit events and ordinary personnel dossier
// records. Keeping the two in the SAME Firestore transaction prevents a
// cancellation from disappearing from weekly reports or a dossier.
const TITLE=Object.freeze({
  submitted:'Verlof aangevraagd',
  automatic_approved:'Verlof automatisch goedgekeurd',
  korpsleiding_vrijgesteld:'Verlof Korpsleiding automatisch geregistreerd',
  approved:'Verlof goedgekeurd',
  rejected:'Verlof geweigerd',
  withdrawn:'Verlof ingetrokken',
  board_override:'Verlofbeslissing herzien door Bestuur',
  manual_approved:'Verlof handmatig goedgekeurd'
});
export const leaveEventLabel=action=>TITLE[action]||'Verlofwijziging';
export const leaveCanWithdraw=(request,today)=>{
  return request&&['pending','approved'].includes(request.status)&&
    typeof request.endDate==='string'&&request.endDate>=today;
};
// An old leave application never disappears; only the latest application
// for the same dates may block a new attempt. Unknown states fail closed.
export const leaveCanReapply=status=>status==='withdrawn'||status==='rejected';
export function leaveEventDetails(action,request,from=null,to=null){
  const base=leaveEventLabel(action)+' · '+request.startDate+' t/m '+
    request.endDate+' ('+request.days+' kalenderdagen)';
  return base+(from?' · status '+from+' → '+(to||'ingetrokken'):'');
}
export function writeLeaveEvent(tx,{requestRef,request,action,actor,actorUid,
  eventDate,from=null,to=null,note=''}) {
  const registeredBy=actor&&typeof actor==='object'?{
    name:String(actor.name||'Onbekend'),call:String(actor.call||''),
    discordId:String(actor.discordId||'')
  }:{name:'Systeem',call:'',discordId:''};
  tx.create(requestRef.collection('audit').doc(),{
    action,from,to,note,actorUid:actorUid||null,
    actorDiscordId:registeredBy.discordId||null,days:request.days,
    at:FieldValue.serverTimestamp()
  });
  const departments=[...new Set((request.subjectDepartments||[])
    .filter(d=>['politie','brandweer','ambulance','depannage'].includes(d)))];
  for(const dept of departments){
    const ref=getFirestore().collection('bpd_cases').doc(dept+'_'+request.personDiscordId)
      .collection('entries').doc();
    const notice=getFirestore().collection('bpd_notices').doc(dept)
      .collection('events').doc();
    tx.create(ref,{
      type:'verlof',leaveAction:action,leaveRequestId:requestRef.id,
      reportCategory:'verlof',dept,
      subjectDiscordId:request.personDiscordId,
      subjectNameAtCreation:request.subjectName||'Onbekend',
      subjectCallAtCreation:request.subjectCall||'',
      eventDate,details:leaveEventDetails(action,request,from,to),
      statusFrom:from,statusTo:to||request.status,
      registeredBy,createdAt:FieldValue.serverTimestamp(),
      modifiedAt:null,source:'central-leave-audit'
    });
    tx.create(notice,{caseId:dept+'_'+request.personDiscordId,
      entryId:ref.id,type:'verlof',dept,createdAt:FieldValue.serverTimestamp()});
  }
}
