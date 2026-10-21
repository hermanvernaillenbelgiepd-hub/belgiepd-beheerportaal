import {canReadBoard} from './to-board-policy.js';
import {createSonoranRadioService} from './to-radio.js';
import {observeRadioDepartures} from './to-radio-auto-end.js';

// Server-side observer: connected police viewers cause fresh Sonoran polls,
// independent of who is currently TO. No client can forge radio presence.
export function installTORadioRoutes(app,{
  requireUser,service=createSonoranRadioService(),store=null,now=Date.now
}={}){
  const departures=new Map();
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
      return res.json(snapshot);
    }catch{return res.status(503).json({error:'De radioverbinding is tijdelijk niet beschikbaar.'});}
  });
}
