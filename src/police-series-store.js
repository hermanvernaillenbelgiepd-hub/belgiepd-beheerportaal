import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {POLICE_SERIES_COLLECTION,POLICE_SERIES_CONTROL,
 firstBalancedPoliceSeries,needsPoliceSeriesAssignment,
 policeSeriesNumber} from './police-series-policy.js';

export async function readPoliceSeriesAssignments(db=getFirestore()){
 const query=await db.collection(POLICE_SERIES_COLLECTION).limit(500).get();
 if(query.size===500)throw Error('Te veel reekstoewijzingen; veilige paginering vereist');
 return query.docs;
}
// Use one coordinator document to serialize concurrent automatic assignments.
// The query and coordinator are read before writes inside the transaction.
export async function reservePoliceSeriesWithinTransaction(tx,db,records,person,{actorUid=null,actorDiscordId=null,reason='Eerste vaste roepnummertoekenning'}={}){
 if(!needsPoliceSeriesAssignment(person))return null;
 const root=db.collection(POLICE_SERIES_COLLECTION),ref=root.doc(person.personId);
 const control=db.collection(POLICE_SERIES_CONTROL).doc('agentreeksen');
 const [lock,old,all]=await Promise.all([
  tx.get(control),tx.get(ref),tx.get(root.limit(499))
 ]);
 if(all.size===499)throw Error('Reeksregister bereikt limiet; controle nodig');
 if(old.exists){
  const value=policeSeriesNumber(old.get('series'));
  return value===null?null:value;
 }
 if(!needsPoliceSeriesAssignment(person,all.docs))return null;
 const chosen=firstBalancedPoliceSeries(records,all.docs,person.personId);
 const at=FieldValue.serverTimestamp();
 tx.create(ref,{dept:'politie',discordId:person.personId,series:chosen,
  revision:1,source:'first_fixed_callsign',updatedAt:at,
  updatedByUid:actorUid,updatedByDiscordId:actorDiscordId});
 tx.set(control,{revision:(lock.get('revision')||0)+1,updatedAt:at},{merge:true});
 tx.create(ref.collection('audit').doc(),{action:'police_series_assigned',
  previous:null,series:chosen,reason,actorUid,actorDiscordId,at});
 return chosen;
}
export async function ensurePoliceSeries(person,records,{db=getFirestore(),
 actorUid=null,actorDiscordId=null,reason}={}){
 if(!needsPoliceSeriesAssignment(person))return null;
 return db.runTransaction(tx=>reservePoliceSeriesWithinTransaction(tx,db,records,person,{
  actorUid,actorDiscordId,reason
 }));
}
