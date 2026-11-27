import {getFirestore} from 'firebase-admin/firestore';
import {occupiedPoliceCalls,firstFreePoliceCall} from './callsign-utils.js';
import {activeCallPersonnel,sameServiceCall} from './personnel-call-ownership.js';
export const PERSONNEL_CALL_CLAIMS='bpd_personnel_call_claims';
export const FIXED_CALL_RESERVATIONS='bpd_callsign_reservations';

// An archived person retains their old number in the dossier, not in the
// ACTIVE call inventory. Historic claim documents with a verified archived
// owner must not make the suggestion report that number as occupied.
// The definitive intake transaction re-verifies ownership and archive state.
export function callHeldByArchivedMember(claim,records=[]){
  const owner=String(claim.discordId||'');
  if(!/^\d{15,22}$/.test(owner))return false;
  const same=(records||[]).filter(person=>person.dept==='politie'&&
    person.personId===owner);
  return same.length===1&&
    ['archived','pending'].includes(String(same[0].lifecycleState||'').toLowerCase())&&
    sameServiceCall('politie',same[0].call,claim.call);
}
export async function readPoliceCallOccupation(records=[],db=getFirestore()){
 const [personnel,fixed]=await Promise.all([
  db.collection(PERSONNEL_CALL_CLAIMS).where('dept','==','politie').get(),
  db.collection(FIXED_CALL_RESERVATIONS).get()
 ]);
 const asClaim=d=>({id:d.id,call:d.get('call')??d.id,discordId:d.get('discordId')});
 const reservationClaims=[...personnel.docs,...fixed.docs].map(asClaim)
  .filter(claim=>!callHeldByArchivedMember(claim,records));
 const active=activeCallPersonnel(records);
 return {occupied:occupiedPoliceCalls({records:active,
    personnelClaims:reservationClaims}),
  suggested:firstFreePoliceCall({records:active,
    personnelClaims:reservationClaims})};
}
