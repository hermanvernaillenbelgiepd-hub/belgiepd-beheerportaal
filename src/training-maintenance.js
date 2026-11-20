// Pure authorization and validation helpers for auditable training changes.
import { isDiscordId } from './discord-utils.js';

export const isArchivedTraining = record => record?.status === 'verwijderd';

// Instructors may maintain only their own *unreviewed* entries.
// An authorized reviewer may maintain records within their authorized department.
export function mayMaintainTraining(record,{ actorDiscordId, mayLog, mayReview }={}){
  if(!record || isArchivedTraining(record) || !isDiscordId(actorDiscordId))return false;
  if(mayReview===true)return true;
  return mayLog===true && record.registeredByDiscordId===actorDiscordId &&
    (record.rosterStatus||'nog_niet_beoordeeld')==='nog_niet_beoordeeld';
}

export function validateMaintenanceReason(value){
  if(typeof value!=='string')throw Error('Vermeld een reden (8 tot 500 tekens)');
  const reason=value.trim();
  if(reason.length<8||reason.length>500)throw Error('Vermeld een reden (8 tot 500 tekens)');
  return reason;
}
export const isRecordId=value=>typeof value==='string' && /^[A-Za-z0-9]{12,30}$/.test(value);

export function requiresReReview(record,updated){
  return (record.rosterStatus||'nog_niet_beoordeeld')!=='nog_niet_beoordeeld' &&
    ['courseName','eventDate','result','details','instructorName','qualificationStage',
       'lessonSessionId','instructorDiscordId'].some(k=>record[k]!==updated[k]);
}
