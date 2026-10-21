import {canReadBoard} from './to-board-policy.js';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {validRadioId,radioLabelInput,mayEditRadioLabel,radioLabelWritesEnabled,enrichRadioSnapshot} from './to-radio-label-policy.js';
import {createSonoranRadioService} from './to-radio.js';
import {observeRadioDepartures} from './to-radio-auto-end.js';

// Server-side observer: connected police viewers cause fresh Sonoran polls,
// independent of who is currently TO. No client can forge radio presence.
export function installTORadioRoutes(app,{
  requireUser,service=createSonoranRadioService(),store=null,now=Date.now,firestore=()=>getFirestore()
}={}){
  const departures=new Map();
  const labels=()=>firestore().collection('bpd_radio_label_overrides');
  const audit=()=>firestore().collection('bpd_radio_label_audit');
  async function withAliases(snapshot){
    if(process.env.FIREBASE_PROJECT_ID!=='belgiepd-test'||!snapshot.connected||snapshot.stale)return snapshot;
    const rows=await labels().limit(201).get();
    if(rows.size>200)throw Error('Te veel radioweergavenaamcorrecties, administratieve controle nodig');
    return {...enrichRadioSnapshot(snapshot,rows.docs.map(d=>({id:d.id,...d.data()}))),radioLabelWritesEnabled:radioLabelWritesEnabled(process.env)};
  }
  let pollJob=Promise.resolve(),lastObservedAt=0;
  const sync=async snapshot=>{
    if(!store||!snapshot?.connected||snapshot.stale||!snapshot.configured)return;
    // A serialized observer avoids double absence-counting or duplicate
    // Firestore writes when several viewers refresh the same 15-second result.
    const run=async()=>{
      const fetched=Date.parse(snapshot?.fetchedAt||'');
      if(!Number.isFinite(fetched)||fetched<=lastObservedAt)return;
      const board=await store.readBoard();
      const timestamp=now();
      const due=observeRadioDepartures(board,snapshot,departures,timestamp);
      if(due.length){
        const ended=await store.autoEndAbsentRadioTeams(due,snapshot,{
          now:timestamp,sessionId:board.session.id
        });
        if(ended?.length)for(const id of ended)departures.delete(id);
      }
      lastObservedAt=fetched;
    };
    pollJob=pollJob.catch(()=>{}).then(run);
    await pollJob;
  };
  app.get('/api/to/radio',requireUser,async(req,res)=>{
    if(!canReadBoard(req.bpd)||typeof req.bpd?.uid!=='string'||!req.bpd.uid)
      return res.status(403).json({error:'Geen toegang tot de politieradio'});
    try{
      const snapshot=await service.read();
      // Radio remains visible even if Firestore is temporarily unavailable;
      // a failed safety reconciliation is retried on the next healthy poll.
      try{await sync(snapshot);}catch{console.error('TO-radio automatische dienstafmelding overgeslagen');}
      // Alias storage failure must NEVER hide otherwise healthy Sonoran data.
      let result=snapshot;
      try{result=await withAliases(snapshot);}catch{console.error('Radioportaal naamcorrecties tijdelijk onbeschikbaar');}
      return res.json(result);
    }catch{return res.status(503).json({error:'De radioverbinding is tijdelijk niet beschikbaar.'});}
  });
  // Explicit staff-facing alias only. Sonoran is read-only; reversing sync needs
  // a verified Sonoran account UUID and dedicated outbound permission flow.
  app.post('/api/to/radio/label',requireUser,async(req,res)=>{
    if(!mayEditRadioLabel(req.bpd))return res.status(403).json({error:'Geen bevoegdheid om radiolabels te corrigeren'});
    if(!radioLabelWritesEnabled(process.env))return res.status(503).json({error:'Radiolabelopslag staat nog uit op TEST'});
    const id=req.body?.radioId;
    if(!validRadioId(id)||!req.body||Object.keys(req.body).some(k=>!['radioId','alias'].includes(k)))
      return res.status(400).json({error:'Ongeldige radioverwijzing'});
    let alias;
    try{alias=radioLabelInput(req.body.alias);}catch(e){return res.status(400).json({error:e.message});}
    try{
      const current=await service.read();
      if(!current.connected||current.stale||!current.users.some(u=>u.id===id))
        return res.status(409).json({error:'Deze radiogebruiker is niet meer actueel verbonden'});
      const doc=labels().doc(id),history=audit().doc();
      await firestore().runTransaction(async tx=>{
        const previous=await tx.get(doc);
        const old=previous.exists?previous.get('alias')||null:null;
        if(old===alias)return;
        const at=FieldValue.serverTimestamp();
        tx.set(doc,{alias,updatedByDiscordId:req.bpd.discordId||null,updatedByUid:req.bpd.uid,
          updatedAt:at,source:'portal_only',sonoranSynced:false});
        tx.create(history,{radioId:id,previousAlias:old,nextAlias:alias,
          byDiscordId:req.bpd.discordId||null,byUid:req.bpd.uid,at});
      });
      return res.json({saved:true,radioId:id,alias,sonoranSynced:false});
    }catch(e){console.error('Radio label correction:',e.code||e.message);return res.status(503).json({error:'Radioweergavenaam kon niet worden opgeslagen'});}
  });
}
