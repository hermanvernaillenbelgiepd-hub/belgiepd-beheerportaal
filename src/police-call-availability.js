import {getFirestore} from 'firebase-admin/firestore';
import {occupiedPoliceCalls,firstFreePoliceCall} from './callsign-utils.js';
export const PERSONNEL_CALL_CLAIMS='bpd_personnel_call_claims';
export const FIXED_CALL_RESERVATIONS='bpd_callsign_reservations';
// All preview sources are read together; each definitive write still checks
// the opposite reservation inside a Firestore transaction.
export async function readPoliceCallOccupation(records=[],db=getFirestore()){
 const [personnel,fixed]=await Promise.all([
  db.collection(PERSONNEL_CALL_CLAIMS).where('dept','==','politie').get(),
  db.collection(FIXED_CALL_RESERVATIONS).get()
 ]);
 const asClaim=d=>({id:d.id,call:d.get('call')??d.id});
 const personnelClaims=personnel.docs.map(asClaim),fixedReservations=fixed.docs.map(asClaim);
 return {occupied:occupiedPoliceCalls({records,personnelClaims,fixedReservations}),
  suggested:firstFreePoliceCall({records,personnelClaims,fixedReservations})};
}
