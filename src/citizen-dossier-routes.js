import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {
  CITIZEN_DOSSIER_COLLECTION,validCitizenId,verifiedCitizenCouncil,
  canAccessCitizenDossier,canWriteCitizenDossier,citizenMemberType,
  citizenSubject,validateCitizenEntry,observationAverage
} from './citizen-dossier-policy.js';

const enabled=()=>process.env.BPD_ENABLE_CITIZEN_STAFF_DOSSIERS==='true';
const writable=()=>enabled()&&process.env.BPD_ENABLE_CITIZEN_STAFF_DOSSIER_WRITES==='true';
const deny=(res,status,error)=>res.status(status).json({error});
const iso=value=>{
  const date=value?.toDate?.()||value;
  return date instanceof Date&&Number.isFinite(date.valueOf())?date.toISOString():null;
};
const clean=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const safePerson=person=>({
  discordId:person.personId,name:clean(person.name,120),call:clean(person.call,30),
  rank:clean(person.rank,100),status:clean(person.status,50),
  series:clean(person.series,50)
});
const safeEntry=doc=>{
  const e=doc.data();
  return {id:doc.id,kind:e.kind,eventDate:clean(e.eventDate,10),
    details:clean(e.details,1600),
    score:e.kind==='observatie'&&Number.isInteger(e.score)?e.score:null,
    createdAt:iso(e.createdAt),
    byDiscordId:validCitizenId(e.byDiscordId)?e.byDiscordId:null};
};
const safeLeave=doc=>{
  const d=doc.data();
  return {id:doc.id,startDate:clean(d.startDate,10),endDate:clean(d.endDate,10),
    status:['pending','approved','rejected','withdrawn'].includes(d.status)?
      d.status:'onbekend',
    manual:d.manual===true,createdAt:iso(d.createdAt),
    decidedAt:iso(d.decidedAt),withdrawnAt:iso(d.withdrawnAt)};
};
async function freshRoster(getSnapshot){
  const snap=await getSnapshot();
  if(snap?.stale||!Array.isArray(snap?.data))
    throw Object.assign(Error('De personeelsbron moet actueel zijn'),{status:503});
  return snap.data;
}
async function uniqueSubject(getSnapshot,id){
  if(!validCitizenId(id))throw Object.assign(Error('Ongeldige Discord-ID'),{status:400});
  const roster=await freshRoster(getSnapshot);
  const matching=roster.filter(p=>p?.dept==='burger'&&p.personId===id);
  if(matching.length!==1)
    throw Object.assign(Error(matching.length?'Dubbel burgerrecord, controle vereist':
      'Deze BIO/Burger staat niet in de personeelslijst'),{status:matching.length?409:404});
  return citizenSubject(roster,id);
}
function fail(res,error){
  if(error?.status)return deny(res,error.status,error.message);
  console.error('Burgerpersoneelsdossier:',error?.code||'onbekend');
  return deny(res,503,'Burgerpersoneelsdossiers tijdelijk niet beschikbaar');
}

export function installCitizenDossierRoutes(app,{requireUser,getSnapshot}){
  async function authorize(req,res,next){
    if(!enabled())return deny(res,503,'Burgerpersoneelsdossiers zijn nog niet geactiveerd');
    try{
      const actor=req.bpd;
      if(!validCitizenId(actor?.discordId)||actor.uid!=='discord:'+actor.discordId)
        return deny(res,403,'Alleen Burgerraad, Korpsleiding of technisch beheer heeft toegang');
      const member=await getFirestore().collection('bpd_discord_auth')
        .doc(actor.discordId).get();
      const verified=verifiedCitizenCouncil(actor,member.data(),
        process.env.DISCORD_GUILD_ID);
      if(!canAccessCitizenDossier(actor,verified))
        return deny(res,403,'Alleen Burgerraad, Korpsleiding of technisch beheer heeft toegang');
      req.citizenCouncilVerified=verified;
      return next();
    }catch(e){return fail(res,e)}
  }
  const protectedUser=[requireUser,authorize];
  const actorWrites=req=>writable()&&(req.citizenCouncilVerified===true||
    req.bpd?.portalTechnicalMode===true&&req.bpd?.profileTechnicalAvailable===true);
  app.get('/api/citizen-staff/access',...protectedUser,(req,res)=>
    res.json({canAccess:true,writesEnabled:actorWrites(req)}));

  app.get('/api/citizen-staff/overview',...protectedUser,async(req,res)=>{
    try{
      const roster=await freshRoster(getSnapshot);
      const subjects=roster.filter(p=>p?.dept==='burger'&&validCitizenId(p.personId));
      const counts=new Map();
      for(const p of subjects)counts.set(p.personId,(counts.get(p.personId)||0)+1);
      // Duplicate Discord IDs remain unavailable until repaired.
      const rows=subjects.filter(p=>counts.get(p.personId)===1)
        .map(safePerson).sort((a,b)=>a.name.localeCompare(b.name,'nl-BE'));
      return res.json({rows,ambiguousRecords:[...counts.values()].filter(n=>n>1).length,
        writesEnabled:actorWrites(req)});
    }catch(e){return fail(res,e)}
  });

  app.get('/api/citizen-staff/:discordId',...protectedUser,async(req,res)=>{
    try{
      const person=await uniqueSubject(getSnapshot,req.params.discordId),db=getFirestore();
      const ref=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.personId);
      const [entriesSnap,leaveSnap,memberSnap]=await Promise.all([
        ref.collection('entries').orderBy('createdAt','desc').limit(200).get(),
        db.collection('bpd_leave_requests').where('personDiscordId','==',person.personId)
          .limit(100).get(),
        db.collection('bpd_discord_auth').doc(person.personId).get()
      ]);
      const entries=entriesSnap.docs.map(safeEntry);
      const leaves=leaveSnap.docs.map(safeLeave)
        .sort((a,b)=>b.startDate.localeCompare(a.startDate));
      const promoted=entries.find(e=>e.kind==='volwaardig')||null;
      return res.json({person:safePerson(person),
        roleType:citizenMemberType(memberSnap.data(),process.env.DISCORD_GUILD_ID),
        canWrite:writable()&&canWriteCitizenDossier(req.bpd,
          req.citizenCouncilVerified,person.personId),
        entries,entriesLimited:entriesSnap.size===200,
        leave:leaves,leaveLimited:leaveSnap.size===100,
        observation:observationAverage(entries),
        volwaardigDate:promoted?.eventDate||null,
        // Een persoonsrapport is de auditbare combinatie van registraties
        // en het centrale verloflog. Nooit een tweede weekrapport schrijven.
        reportAvailable:true});
    }catch(e){return fail(res,e)}
  });

  app.post('/api/citizen-staff/:discordId/entries',...protectedUser,async(req,res)=>{
    if(!writable())return deny(res,503,'Burgerdossierregistraties staan uit');
    let proposal;
    try{proposal=validateCitizenEntry(req.body)}
    catch(e){return deny(res,400,e.message)}
    try{
      const person=await uniqueSubject(getSnapshot,req.params.discordId);
      if(!canWriteCitizenDossier(req.bpd,req.citizenCouncilVerified,person.personId))
        return deny(res,403,'Geen bevoegdheid voor deze burgerregistratie');
      const db=getFirestore();
      const parent=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.personId);
      const entry=parent.collection('entries').doc(),batch=db.batch();
      batch.set(parent,{discordId:person.personId,updatedAt:FieldValue.serverTimestamp()},
        {merge:true});
      batch.create(entry,{...proposal,byDiscordId:req.bpd.discordId,
        createdAt:FieldValue.serverTimestamp()});
      await batch.commit();
      return res.status(201).json({saved:true,id:entry.id,
        weeklyReportWritten:false});
    }catch(e){return fail(res,e)}
  });
}
