import {canReadBoard} from './to-board-policy.js';
import {createSonoranRadioService} from './to-radio.js';

export function installTORadioRoutes(app,{requireUser,service=createSonoranRadioService()}={}){
  app.get('/api/to/radio',requireUser,async(req,res)=>{
    if(!canReadBoard(req.bpd)||typeof req.bpd?.uid!=='string'||!req.bpd.uid)
      return res.status(403).json({error:'Geen toegang tot de politieradio'});
    try{return res.json(await service.read());}
    catch{return res.status(503).json({error:'De radioverbinding is tijdelijk niet beschikbaar.'});}
  });
}
