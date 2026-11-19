// Activities follow-up is advisory. Status is not a personnel status change.
// Verified bot telemetry and approved leave are evaluated separately from
// manually entered Discord-ping attestations.
export const ACTIVITY_FOLLOWUP_STATUS=Object.freeze([
 'ACTIEF','50/50','INACTIEF','VERWIJDERING_TE_BEOORDELEN',
 'GEEN_VERBETERING_NA_PING'
]);
export const ACTIVITY_FOLLOWUP_LABELS=Object.freeze({
 ACTIEF:'Actief',
 '50/50':'50/50',
 INACTIEF:'Inactief',
 VERWIJDERING_TE_BEOORDELEN:'60+ dagen · verwijdering beoordelen',
 GEEN_VERBETERING_NA_PING:'Geen activiteitsverbetering na eerdere ping'
});
export const ACTIVITY_FOLLOWUP_SEVERITY=Object.freeze({
 ACTIEF:0,'50/50':1,INACTIEF:2,VERWIJDERING_TE_BEOORDELEN:3,
 GEEN_VERBETERING_NA_PING:2
});
export function activityFollowupStatus({hours=null,daysAbsent=null,onApprovedLeave=false}={}){
 if(onApprovedLeave)return {status:null,reason:'Goedgekeurd verlof: geen automatische statusaanbeveling'};
 const validHours=typeof hours==='number'&&Number.isFinite(hours)&&hours>=0;
 const validDays=typeof daysAbsent==='number'&&Number.isFinite(daysAbsent)&&daysAbsent>=0;
 if(!validHours&&!validDays)return {status:null,reason:'Geen geverifieerde gegevens beschikbaar'};
 const days=validDays?daysAbsent:-1;
 const status=days>=60?'VERWIJDERING_TE_BEOORDELEN':
  days>=30||validHours&&hours<10?'INACTIEF':
  days>=15||validHours&&hours<20?'50/50':'ACTIEF';
 return {status,
  reason:status==='VERWIJDERING_TE_BEOORDELEN'?
   '60+ dagen zonder verbinding: uitsluitend beoordeling, geen automatische verwijdering':
   'Opvolgvoorstel op basis van geverifieerde speeluren en/of afwezigheid'};
}
export function activityPingRegistration(value){
 if(!ACTIVITY_FOLLOWUP_STATUS.includes(value?.activityStatus))
  throw Error('Ongeldige activiteitenstatus');
 if(typeof value?.discordPingSent!=='boolean')
  throw Error('Bevestig of er daadwerkelijk een Discord-ping is verstuurd');
 const date=value.discordPingDate;
 if(value.discordPingSent){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    !Number.isFinite(Date.parse(date+'T12:00:00Z'))||
    new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)
    throw Error('Vul de datum van de verstuurde Discord-ping in');
 }else if(date)throw Error('Discord-pingdatum mag alleen bij een verstuurde ping');
 return {activityStatus:value.activityStatus,discordPingSent:value.discordPingSent,
  ...(value.discordPingSent?{discordPingDate:date}:{})};
}
