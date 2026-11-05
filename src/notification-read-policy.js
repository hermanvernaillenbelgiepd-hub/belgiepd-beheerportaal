// Per-user acknowledgements never change a shared notification's workflow status.
import {SERIES_LEADERS,personSeries} from './training-request-policy.js';

export function notificationReadByViewer(record,viewerId){
  if(!record||typeof viewerId!=='string'||!viewerId||typeof record.status!=='string')
    return false;
  return record.readBy?.[viewerId]?.status===record.status;
}

// Same permission predicate is used for listing and acknowledging a police
// series leave notice. The requesting member's latest roster series is authoritative.
export function canSeeSeriesLeaveNotification(ownerId,ownerPolice,subject,request,now=Date.now()){
  if(!ownerPolice||!subject||!request||ownerId===request.personDiscordId)
    return false;
  const series=personSeries(subject);
  if(!series||!SERIES_LEADERS[series]?.includes(ownerId))return false;
  if(request.status==='pending')return true;
  if(request.status==='approved'&&request.autoApproved===true){
    const at=request.createdAt?.toMillis?.()||0;
    return at>0&&now>=at&&now-at<=72*60*60*1000;
  }
  return false;
}
