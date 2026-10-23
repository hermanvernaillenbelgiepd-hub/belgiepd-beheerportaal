import {FieldValue,getFirestore} from 'firebase-admin/firestore';
import {validDate} from './management-utils.js';

const enabled=()=>process.env.BPD_ENABLE_BURGER_DOSSIERS==='true'&&
  process.env.FIREBASE_PROJECT_ID==='belgiepd-test';
const canWrite=()=>enabled()&&process.env.BPD_ENABLE_BURGER_DOSSIER_WRITES==='true';
const ID=/^\d{15,22}$/;
const REPORT=/^[A-Za-z0-9]{12,30}$/;
const error=(res,status,message)=>res.status(status).json({error:message});
const isoTime=v=>v?.toDate?.()?.toISOString?.()||null;

export function validateBurgerWeekReport(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['title','periodStart','periodEnd'].includes(k)))
    throw Error('Ongeldig weekrapport');
  const title=typeof body.title==='string'?body.title.trim():'';
  if(title.length<3||title.length>120||/[\x00-\x1f<>]/.test(title))
    throw Error('Rapporttitel is verplicht (3 tot 120 tekens)');
  if(!validDate(body.periodStart)||!validDate(body.periodEnd)||
      body.periodEnd<body.periodStart)throw Error('Ongeldige rapportperiode');
  const days=1+(Date.parse(body.periodEnd+'T12:00:00Z')-
    Date.parse(body.periodStart+'T12:00:00Z'))/86400000;
  if(days>31)throw Error('Rapportperiode mag maximaal 31 kalenderdagen duren');
  return {title,periodStart:body.periodStart,periodEnd:body.periodEnd,
    status:'concept',dept:'burger'};
}
export function summarizeBurgerWeekEntries(entries,start,end){
  return (Array.isArray(entries)?entries:[])
    .filter(e=>['observatie','notitie','opleiding'].includes(e?.type)&&
      typeof e.eventDate==='string'&&e.eventDate>=start&&e.eventDate<=end)
    .map(e=>({
      type:e.type,eventDate:e.eventDate,
      title:String(e.title||'').slice(0,120),
      details:String(e.details||'').slice(0,2000),
      subjectName:String(e.subjectNameAtCreation||'').slice(0,120),
      author:String(e.authorName||'').slice(0,80)
    }))
    .sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||
      a.subjectName.localeCompare(b.subjectName));
}

export function installBurgerWeekReportRoutes(app,{requireUser,getSnapshot}){
  const rights=(req,res,next)=>{
    if(!enabled())return error(res,503,'Burgerweekrapporten zijn niet geactiveerd');
    if(req.bpd?.burgerDossierAccess?.read!==true)
      return error(res,403,'Geen toegang tot Burgerweekrapporten');
    next();
  };
  const writes=(req,res,next)=>{
    if(!canWrite())return error(res,503,'Burgerweekrapporten zijn alleen-lezen');
    if(req.bpd?.burgerDossierAccess?.write!==true)
      return error(res,403,'Burgerraad of bevoegde Korpsleiding vereist');
    next();
  };
  // Gedeelde collectie, gescheiden op het vaste dept='burger' veld.
  // Nooit een door de client gekozen hulpdienst gebruiken.
  app.get('/api/burger-reports',requireUser,rights,async(_req,res)=>{
    try{
      const snapshot=await getFirestore().collection('bpd_weekreports')
        .where('dept','==','burger').limit(100).get();
      const reports=snapshot.docs.map(doc=>{
        const d=doc.data();
        return {id:doc.id,title:String(d.title||'').slice(0,120),
          periodStart:d.periodStart,periodEnd:d.periodEnd,status:d.status||'concept',
          createdAt:isoTime(d.createdAt),createdBy:String(d.createdBy?.name||'').slice(0,80)};
      }).sort((a,b)=>(b.periodStart||'').localeCompare(a.periodStart||''));
      return res.json({reports,limited:snapshot.size===100,
        canWrite:canWrite()&&_req.bpd.burgerDossierAccess.write===true});
    }catch(e){console.error('Burgerweekrapporten:',e?.code||'fout');
      return error(res,503,'Burgerweekrapporten niet beschikbaar')}
  });
  app.post('/api/burger-reports',requireUser,rights,writes,async(req,res)=>{
    let report;
    try{report=validateBurgerWeekReport(req.body)}
    catch(e){return error(res,400,e.message)}
    try{
      const doc=getFirestore().collection('bpd_weekreports').doc();
      await doc.create({...report,
        createdBy:{name:req.bpd.discordId,discordId:req.bpd.discordId},
        createdByUid:req.bpd.uid,
        createdAt:FieldValue.serverTimestamp()});
      return res.status(201).json({saved:true,id:doc.id});
    }catch(e){console.error('Burgerweekrapport aanmaken:',e?.code||'fout');
      return error(res,503,'Burgerweekrapport kon niet worden aangemaakt')}
  });
  app.get('/api/burger-reports/:reportId',requireUser,rights,async(req,res)=>{
    const id=req.params.reportId;
    if(!REPORT.test(id))return error(res,400,'Ongeldige rapportverwijzing');
    try{
      const db=getFirestore(),doc=await db.collection('bpd_weekreports').doc(id).get();
      if(!doc.exists||doc.get('dept')!=='burger')
        return error(res,404,'Burgerweekrapport niet gevonden');
      const record=doc.data();
      const snapshot=await getSnapshot();
      if(snapshot.stale)return error(res,503,'Actuele Burgerpersoneelsbron niet beschikbaar');
      const people=snapshot.data.filter(p=>p.dept==='burger'&&ID.test(p.personId));
      if(people.length>300)return error(res,503,'Te veel burgerdossiers voor een volledig rapport');
      const unique=new Set(),entries=[];let truncated=false;
      for(const person of people){
        if(unique.has(person.personId))
          return error(res,409,'Dubbele Burgeridentiteit; controle vereist');
        unique.add(person.personId);
      }
      for(const person of people){
        const query=await db.collection('bpd_cases').doc('burger_'+person.personId)
          .collection('entries')
          .where('eventDate','>=',record.periodStart)
          .where('eventDate','<=',record.periodEnd)
          .limit(201).get();
        if(query.size>200)truncated=true;
        const records=query.docs.slice(0,200).map(d=>d.data())
          .filter(d=>d.dept==='burger'&&d.subjectDiscordId===person.personId);
        entries.push(...summarizeBurgerWeekEntries(records,record.periodStart,record.periodEnd));
      }
      const sections=['observatie','notitie','opleiding'].map(type=>({
        type,label:({observatie:'Observaties',notitie:'Notities',opleiding:'Opleidingen'})[type],
        entries:entries.filter(e=>e.type===type)
      }));
      return res.json({report:{id:doc.id,title:record.title,dept:'burger',
        periodStart:record.periodStart,periodEnd:record.periodEnd,status:record.status},
        sections,recordCount:entries.length,truncated,
        disclaimer:'Concept uit Burgerdossiers. Verlof staat in het centrale verlofbeheer en overige diensten zijn uitgesloten.'});
    }catch(e){console.error('Burgerweekrapport opbouwen:',e?.code||'fout');
      return error(res,503,'Burgerweekrapport kon niet worden samengesteld')}
  });
}
