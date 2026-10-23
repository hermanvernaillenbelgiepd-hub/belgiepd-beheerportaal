import {FieldValue,getFirestore} from 'firebase-admin/firestore';
import {BURGER_PERSONNEL_COLLECTION,burgerSubjectCategory} from './burger-role-policy.js';

const ID=/^\d{15,22}$/;
const STATUS=Object.freeze(['observatie','notitie','opleiding']);
const failure=(res,status,msg)=>res.status(status).json({error:msg});
const dateValid=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&
  new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const safe=(text,max)=>typeof text==='string'&&
  text.trim().length>0&&text.trim().length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/.test(text);
const toIso=value=>value?.toDate?.()?.toISOString?.()||null;
const enabled=()=>process.env.BPD_ENABLE_BURGER_DOSSIERS==='true';
const writeEnabled=()=>enabled()&&process.env.BPD_ENABLE_BURGER_DOSSIER_WRITES==='true';
// Persoonsidentiteit gekoppeld aan een aparte, geverifieerde Burger-bron.
export function installBurgerDossierRoutes(app,{requireUser,getSnapshot}){
  const guard=(req,res,next)=>{
    if(!enabled())return failure(res,503,'Burgerdossiers nog niet ingeschakeld');
    if(req.bpd?.burgerDossierAccess?.read!==true)
      return failure(res,403,'Geen Burgerdossierrechten');
    next();
  };
  const canWrite=(req,res,next)=>{
    if(!writeEnabled())return failure(res,503,'Bewerkingen zijn nog niet geactiveerd');
    if(req.bpd?.burgerDossierAccess?.write!==true)
      return failure(res,403,'Bestuur heeft alleen inzage; Burgerraad of bevoegde Korpsleiding vereist');
    next();
  };
  async function subject(discordId){
    const snap=await getSnapshot();
    return snap.data.filter(p=>p.dept==='burger'&&p.personId===discordId);
  }
  app.get('/api/burger-dossiers/:discordId',requireUser,guard,async(req,res)=>{
    const id=req.params.discordId;
    if(!ID.test(id))return failure(res,400,'Ongeldig Discord-ID');
    try{
      const people=await subject(id);
      if(people.length!==1)return failure(res,people.length?409:404,'Geen eenduidig Burgerdossier');
      const data=await getFirestore().collection('bpd_cases').doc('burger_'+id)
        .collection('entries').orderBy('createdAt','desc').limit(100).get();
      return res.json({person:{name:people[0].name,rank:people[0].rank,
        call:people[0].call,status:people[0].status},
        canWrite:writeEnabled()&&req.bpd.burgerDossierAccess.write===true,
        entries:data.docs.map(d=>{
          const p=d.data();
          return {id:d.id,type:p.type,eventDate:p.eventDate,title:String(p.title||'').slice(0,120),
            details:String(p.details||'').slice(0,2000),
            recordedAt:toIso(p.createdAt),author:String(p.authorName||'').slice(0,90)};
        }),limited:data.size===100});
    }catch(e){
      console.error('Burgerdossier lezen:',e?.code||'onbekend');
      return failure(res,503,'Burgerdossier niet beschikbaar');
    }
  });
  app.post('/api/burger-dossiers/personnel',requireUser,guard,canWrite,async(req,res)=>{
    const id=req.body?.discordId;
    if(!ID.test(id)||Object.keys(req.body||{}).some(k=>k!=='discordId'))
      return failure(res,400,'Alleen een geldig Discord-ID is toegelaten');
    try{
      const db=getFirestore();
      const auth=await db.collection('bpd_discord_auth').doc(id).get();
      const roles=auth.exists?auth.data():null;
      // Dubbel gebruikte Burger/Burger IO rol nooit stilzwijgend omzetten naar een van beide.
      const category=burgerSubjectCategory(roles,process.env.DISCORD_GUILD_ID);
      if(!category)return failure(res,409,'Dit lid moet zijn burgerrol opnieuw verifiëren via Discord');
      const name=String(roles.username||'').trim();
      if(!safe(name,80))return failure(res,409,'Geen geverifieerde Discord-naam gevonden');
      const ref=db.collection(BURGER_PERSONNEL_COLLECTION).doc(id);
      try{
        await ref.create({discordId:id,name,
          category:'burger_onbevestigd',createdAt:FieldValue.serverTimestamp(),
          createdByDiscordId:req.bpd.discordId||null});
      }catch(e){
        if(e?.code===6||e?.code==='already-exists')return failure(res,409,'Burgerdossier bestaat al');
        throw e;
      }
      await ref.collection('audit').add({action:'created',byDiscordId:req.bpd.discordId||null,
        at:FieldValue.serverTimestamp()});
      return res.status(201).json({saved:true,category:'burger_onbevestigd'});
    }catch(e){
      console.error('Burgerdossier aanmaken:',e?.code||'onbekend');
      return failure(res,503,'Burgerdossier kon niet worden aangemaakt');
    }
  });
  app.post('/api/burger-dossiers/:discordId/entries',requireUser,guard,canWrite,async(req,res)=>{
    const id=req.params.discordId,body=req.body||{};
    if(!ID.test(id)||!STATUS.includes(body.type)||!dateValid(body.eventDate)||
      !safe(body.title,120)||!safe(body.details,2000)||
      Object.keys(body).some(k=>!['type','eventDate','title','details'].includes(k)))
      return failure(res,400,'Vul type, datum, titel en omschrijving correct in');
    if(id===req.bpd.discordId)return failure(res,403,'Geen eigen dossierregistraties toegestaan');
    try{
      const people=await subject(id);
      if(people.length!==1)return failure(res,404,'Burgerdossier niet gevonden');
      const db=getFirestore();
      const ref=db.collection('bpd_cases').doc('burger_'+id).collection('entries').doc();
      const batch=db.batch();
      const when=FieldValue.serverTimestamp();
      batch.create(ref,{
        dept:'burger',subjectDiscordId:id,type:body.type,
        title:body.title.trim(),details:body.details.trim(),
        eventDate:body.eventDate,
        subjectNameAtCreation:people[0].name,
        authorDiscordId:req.bpd.discordId,
        authorName:req.bpd.email||req.bpd.discordId,
        createdAt:when
      });
      batch.create(db.collection('bpd_notices').doc('burger').collection('events').doc(),{
        dept:'burger',caseId:'burger_'+id,entryId:ref.id,type:body.type,createdAt:when
      });
      await batch.commit();
      return res.status(201).json({saved:true});
    }catch(e){
      console.error('Burgerregistratie:',e?.code||'onbekend');
      return failure(res,503,'Registratie kon niet worden opgeslagen');
    }
  });
}
