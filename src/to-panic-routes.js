import {timingSafeEqual} from 'node:crypto';
import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {canReadBoard} from './to-board-policy.js';
import {parseTOPanicEvent,publicTOPanics} from './to-panic-policy.js';
const collection='bpd_to_panics';
const ready=()=>{
  if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
  return getFirestore();
};
const validSecret=(provided,expected)=>{
  if(typeof expected!=='string'||expected.length<32||typeof provided!=='string'||provided.length!==expected.length)return false;
  return timingSafeEqual(Buffer.from(provided),Buffer.from(expected));
};
export function installTOPanicRoutes(app,{requireUser,firestore=ready,clock=Date.now,secret=()=>process.env.BPD_FIVEM_PANIC_TOKEN}={}){
  // Only a dedicated server resource possessing a separate secret may publish.
  // This must never reuse a Sonoran Radio or Discord API token.
  app.post('/api/to/panic-hook',async(req,res)=>{
    const bearer=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.get('Authorization')||'')?.[1]||'';
    if(!validSecret(bearer,secret()))return res.status(401).json({error:'Beveiligde FiveM-koppeling niet ingesteld of ongeldig'});
    let event;
    try{event=parseTOPanicEvent(req.body,clock());}
    catch(error){return res.status(error.publicStatus||400).json({error:error.message});}
    try{
      const ref=firestore().collection(collection).doc(event.serverId);
      const at=clock();
      let changed=false;
      await firestore().runTransaction(async transaction=>{
        const prior=await transaction.get(ref),previous=prior.exists?prior.data():null;
        if(previous&&Number.isSafeInteger(previous.occurredAt)&&previous.occurredAt>event.occurredAt)return;
        // No raw game identifiers, IP addresses, tokens or Discord records stored.
        transaction.set(ref,{...event,receivedAt:at,updatedBy:'fivem-sonoran',
          clearedAt:event.active?null:at});
        changed=true;
      });
      res.status(202).json({ok:true,applied:changed});
    }catch(error){
      console.error('FiveM noodknop-opslag tijdelijk niet beschikbaar');
      res.status(503).json({error:'Noodsignaal kon niet opgeslagen worden'});
    }
  });
  app.get('/api/to/panics',requireUser,async(req,res)=>{
    if(!canReadBoard(req.bpd))return res.status(403).json({error:'Geen TO-toegang'});
    try{
      const snapshot=await firestore().collection(collection).limit(100).get();
      const panics=publicTOPanics(snapshot.docs.map(d=>d.data()),clock())
        .sort((a,b)=>b.receivedAt-a.receivedAt);
      const recentCleared=snapshot.docs.map(d=>d.data()).filter(e=>!e.active&&Number.isSafeInteger(e.clearedAt)&&clock()-e.clearedAt<=24*3600*1000)
        .sort((a,b)=>b.clearedAt-a.clearedAt).slice(0,10)
        .map(e=>({name:String(e.name||'Onbekend').slice(0,80),clearedAt:e.clearedAt}));
      res.set('Cache-Control','no-store').json({panics,recentCleared});
    }catch(error){console.error('FiveM noodknopstatus kon niet gelezen worden');res.status(503).json({error:'Noodknoppen tijdelijk niet beschikbaar'});}
  });
}
