import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {DC_TRANSFER_ALIASES} from './dc-id-transfer-policy.js';
import {POLICE_SERIES_COLLECTION,POLICE_SERIES_CONTROL,
 firstBalancedPoliceSeries,needsPoliceSeriesAssignment,
 policeSeriesNumber,activePoliceSeriesDocuments} from './police-series-policy.js';

export async function readPoliceSeriesAssignments(db=getFirestore()){
 const [query,aliases]=await Promise.all([
   db.collection(POLICE_SERIES_COLLECTION).limit(500).get(),
   db.collection(DC_TRANSFER_ALIASES).limit(201).get()
 ]);
 if(query.size===500||aliases.size===201)
   throw Error('Te veel reekstoewijzingen of identiteitsoverdrachten; veilige paginering vereist');
 return activePoliceSeriesDocuments(query.docs,aliases.docs);
}
// Use one coordinator document to serialize concurrent automatic assignments.
// The query and coordinator are read before writes inside the transaction.
export async function reservePoliceSeriesWithinTransaction(tx,db,records,person,{actorUid=null,actorDiscordId=null,reason='Eerste vaste roepnummertoekenning'}={}){
 if(!needsPoliceSeriesAssignment(person))return null;
 const root=db.collection(POLICE_SERIES_COLLECTION),ref=root.doc(person.personId);
 const control=db.collection(POLICE_SERIES_CONTROL).doc('agentreeksen');
 const [lock,old,all,aliases]=await Promise.all([
  tx.get(control),tx.get(ref),tx.get(root.limit(499)),
  tx.get(db.collection(DC_TRANSFER_ALIASES).limit(201))
 ]);
 if(all.size===499||aliases.size===201)
   throw Error('Reeksregister of overdrachtsarchief bereikt limiet; controle nodig');
 const active=activePoliceSeriesDocuments(all.docs,aliases.docs);
 if(old.exists){
  const value=policeSeriesNumber(old.get('series'));
  return value===null?null:value;
 }
 if(!needsPoliceSeriesAssignment(person,active))return null;
 const chosen=firstBalancedPoliceSeries(records,active,person.personId);
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
