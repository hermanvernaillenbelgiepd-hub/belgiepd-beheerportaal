import {getFirestore} from 'firebase-admin/firestore';

// Searchable, display-only LRD speciality. A Discord role is never a cadre,
// a dossier grant, or permission to change personnel data.
export const LRD_DISCORD_ROLE_ID='1380843428354592780';
export const LRD_SPECIALTY_LABEL='LRD (Recherche)';
const DISCORD_ID=/^\d{15,22}$/;
const FRESH_MS=15*60*1000;
const CACHE_MS=30*1000;

export function verifiedPoliceLrdRole(member,guildId,now=Date.now()){
  return Boolean(typeof guildId==='string'&&guildId.length>0&&
    member?.guildId===guildId&&
    Number.isSafeInteger(member.verifiedAt)&&
    member.verifiedAt<=now&&now-member.verifiedAt<=FRESH_MS&&
    Array.isArray(member.roleIds)&&member.roleIds.includes(LRD_DISCORD_ROLE_ID));
}

// Share one small, time-limited cache across members opening the read-only
// roster; never fetch the entire Discord identity document to the browser.
// Firestore getAll batches avoid an N-request load per connected member.
export function createPoliceLrdIndex({
  firestore=()=>getFirestore(),guildId=()=>process.env.DISCORD_GUILD_ID,
  now=Date.now
}={}){
  let key=null,expires=0,verified=new Set(),pending=null;
  return async function verifiedMemberIds(roster){
    const ids=[...new Set((Array.isArray(roster)?roster:[])
      .filter(p=>p?.dept==='politie'&&DISCORD_ID.test(String(p.personId||'')))
      .map(p=>p.personId))].sort().slice(0,500);
    const guild=guildId(),signature=JSON.stringify([guild,ids]);
    const timestamp=now();
    if(key===signature&&timestamp<expires)return new Set(verified);
    if(pending?.signature===signature)return new Set(await pending.promise);
    const job={signature,promise:null};
    job.promise=(async()=>{
      const found=new Set();
      if(!guild||!ids.length)return found;
      const db=firestore();
      for(let start=0;start<ids.length;start+=50){
        const group=ids.slice(start,start+50);
        const docs=await db.getAll(...group.map(id=>db.collection('bpd_discord_auth').doc(id)));
        if(docs.length!==group.length)throw Error('LRD-verificatie is onvolledig');
        for(let i=0;i<docs.length;i++){
          if(docs[i]?.exists&&verifiedPoliceLrdRole(docs[i].data(),guild,now()))
            found.add(group[i]);
        }
      }
      return found;
    })();
    pending=job;
    try{
      const fresh=await job.promise;
      if(pending===job){
        key=signature;verified=new Set(fresh);expires=now()+CACHE_MS;
      }
      return new Set(fresh);
    }finally{if(pending===job)pending=null;}
  };
}
