// A roepnummer is an active assignment, never an identity or dossier key.
// Archiving preserves the old number in its historical snapshot, but releases
// only Firestore locks proven to belong to that exact archived service member.
import {personnelCallClaimId} from './personnel-editor-policy.js';
import {PERSONNEL_LIFECYCLE_COLLECTION} from './personnel-lifecycle-policy.js';

const ID=/^\d{15,22}$/;
const retired=new Set(['archived','pending']);
export const activeCallPersonnel=records=>(records||[]).filter(
  person=>!retired.has(String(person?.lifecycleState||'').toLowerCase())
);
export function sameServiceCall(dept,first,second){
  const normalized=s=>String(s||'').trim().toLocaleLowerCase('nl');
  if(dept==='politie'){
    const numeric=s=>/^(?:s[- ]?)?([1-9]\d{2})$/i.exec(String(s||'').trim())?.[1]||null;
    const a=numeric(first),b=numeric(second);
    if(a&&b)return a===b;
  }
  return normalized(first)!==''&&normalized(first)===normalized(second);
}
export function callReservationRefs(db,dept,call){
  const refs=new Map(),add=ref=>refs.set(ref.path,ref);
  const store=db.collection('bpd_personnel_call_claims');
  const text=String(call||'').trim();
  add(store.doc(personnelCallClaimId(dept,text)));
  if(dept==='politie'){
    const numeric=/^(?:S[- ]?)?([1-9]\d{2})$/i.exec(text)?.[1];
    if(numeric){
      for(const spelling of [numeric,'S'+numeric,'S-'+numeric,'S '+numeric])
        add(store.doc(personnelCallClaimId(dept,spelling)));
      add(db.collection('bpd_callsign_reservations').doc(numeric));
    }
  }
  return [...refs.values()];
}
const primaryClaim=(db,dept,call)=>db.collection('bpd_personnel_call_claims')
  .doc(personnelCallClaimId(dept,call));

export function archivedOwnerProof(claim,lifecycle,dept,call){
  if(!claim?.exists||!lifecycle?.exists)return false;
  const id=claim.get('discordId'),record=lifecycle.data(),historic=record?.snapshot;
  const claimCall=claim.get('call');
  return ID.test(String(id||''))&&
    record?.dept===dept&&record.discordId===id&&
    retired.has(record.state)&&
    historic?.dept===dept&&historic.personId===id&&
    sameServiceCall(dept,historic.call,call)&&
    (!claimCall||sameServiceCall(dept,claimCall,call));
}

// Must be called before any transaction writes. An existing lock is only
// recyclable after a transactional read of the old owner's archive state.
// Unknown owners, pending unlinked intake and active assignments fail closed.
export async function inspectCallReservation(tx,db,dept,call){
  const refs=callReservationRefs(db,dept,call);
  const docs=await Promise.all(refs.map(ref=>tx.get(ref)));
  const archives=new Map();
  for(const doc of docs){
    if(!doc.exists)continue;
    const owner=doc.get('discordId');
    if(!ID.test(String(owner||'')))continue;
    if(!archives.has(owner))
      archives.set(owner,await tx.get(db.collection(PERSONNEL_LIFECYCLE_COLLECTION)
        .doc(dept+'_'+owner)));
  }
  const blocked=docs.filter(doc=>doc.exists&&!archivedOwnerProof(
    doc,archives.get(doc.get('discordId')),dept,call));
  return {docs,blocked};
}
export function assignCallReservation(tx,db,inspection,dept,call,discordId,metadata={}){
  if(inspection.blocked.length)throw Error('Roepnummer is nog bezet of gereserveerd');
  const desired=primaryClaim(db,dept,call);
  const canonical=/^(?:S[- ]?)?([1-9]\d{2})$/i.exec(String(call||'').trim())?.[1];
  const also=dept==='politie'&&canonical?
    primaryClaim(db,dept,canonical):null;
  const chosen=new Set([desired.path,...(also?[also.path]:[])]);
  const at=metadata.updatedAt;
  const data=ref=>({dept,discordId,
    call:also&&ref.path===also.path?canonical:call,
    ...(ref.path===desired.path&&metadata.internalId!==undefined?
      {internalId:metadata.internalId}:{}),
    ...(at?{updatedAt:at}:{})});
  for(const doc of inspection.docs){
    if(doc.exists&&!chosen.has(doc.ref.path))tx.delete(doc.ref);
  }
  for(const ref of [desired,...(also&&also.path!==desired.path?[also]:[])]){
    const previous=inspection.docs.find(doc=>doc.ref.path===ref.path);
    if(previous?.exists)tx.set(ref,data(ref));else tx.create(ref,data(ref));
  }
}

// Archive preparation is read-only. Apply the returned deletions only after
// every read in the archiving transaction has finished.
export async function prepareCallRelease(tx,db,subjects){
  const refs=new Map();
  for(const subject of subjects){
    if(!subject?.dept||!ID.test(String(subject.personId||''))||!subject.call)continue;
    for(const ref of callReservationRefs(db,subject.dept,subject.call))
      refs.set(ref.path,{ref,subject});
  }
  const docs=await Promise.all([...refs.values()].map(x=>tx.get(x.ref)));
  return docs.flatMap((doc,index)=>{
    const subject=[...refs.values()][index].subject;
    return doc.exists&&doc.get('discordId')===subject.personId&&
      (!doc.get('call')||sameServiceCall(subject.dept,doc.get('call'),subject.call))?
      [doc.ref]:[];
  });
}
export function releasePreparedCallClaims(tx,refs){
  for(const ref of refs||[])tx.delete(ref);
}
