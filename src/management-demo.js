// Alleen TEST-branch: geïsoleerde demonstratiedossiers in procesgeheugen.
// Geen Firestore-writes, echte Discord-ID's of wijzigingen aan personeelsdata.
import {randomUUID} from 'node:crypto';
import {validateManagementEntry,mayWriteManagement,reportSections,parseDate} from './management-utils.js';
import {validateEntry,validateAmend,maySubmit,mayAmend,canChooseSanction} from './registrations.js';
import {canReadServiceDossier} from './service-dossier-access.js';

export const DEMO_SUBJECTS=Object.freeze([
  {dept:'politie',discordId:'DEMO-POL-201',name:'[DEMO] Noor Vermeer',call:'TEST-201',rank:'Agent van politie',demo:true},
  {dept:'politie',discordId:'DEMO-POL-235',name:'[DEMO] Milan De Smet',call:'TEST-235',rank:'Inspecteur',demo:true},
  {dept:'politie',discordId:'DEMO-POL-302',name:'[DEMO] Lotte Peeters',call:'TEST-302',rank:'Hoofdinspecteur',demo:true},
  {dept:'brandweer',discordId:'DEMO-BW-901',name:'[DEMO] Emma Jacobs',call:'TEST-BW-901',rank:'Brandweerman',demo:true},
  {dept:'ambulance',discordId:'DEMO-AMB-901',name:'[DEMO] Ruben Maes',call:'TEST-AMB-901',rank:'Ambulancier',demo:true},
  {dept:'depannage',discordId:'DEMO-DEP-901',name:'[DEMO] Lisa Claes',call:'TEST-DEP-901',rank:'Depanneur',demo:true}
]);

export const isDemoSubject=id=>DEMO_SUBJECTS.some(person=>person.discordId===id);
const findDemo=(dept,id)=>DEMO_SUBJECTS.find(person=>person.dept===dept&&person.discordId===id);
const dataByUser=new Map();
const day=()=>new Date().toISOString().slice(0,10);
function initialEntries(){
  const date=day();
  const entry=(subject,type,details,extra={})=>({
    id:randomUUID().replace(/-/g,''),type,dept:subject.dept,
    subjectDiscordId:subject.discordId,subjectCallAtCreation:subject.call,
    subjectNameAtCreation:subject.name,eventDate:date,details,
    registeredBy:{name:'[DEMO] Oefeninvoer',call:'TEST-TO'},createdAt:new Date().toISOString(),
    demoRecord:true,testRecord:false,...extra
  });
  const [noor,milan,lotte,bw,ambu,dep]=DEMO_SUBJECTS;
  return [
    entry(noor,'notitie','[DEMO] Opvolging radioverkeer tijdens proefdienst.'),
    entry(noor,'observatie','[DEMO] Correcte radiomelding tijdens fictieve controle.',{eventTime:'10:30'}),
    entry(milan,'sanctie','[DEMO] Fictieve waarschuwing wegens onjuist radioprotocol.',{
      eventTime:'11:20',sanctionType:'Mondelinge waarschuwing',reasons:['Radioprotocol'],
      severity:2,status:'actief'
    }),
    entry(lotte,'opleiding','[DEMO] Interne opleiding afgerond.',{courseName:'Radiogebruik basis'}),
    entry(bw,'activiteit','[DEMO] Voorbeeldregistratie oefening brandweer.'),
    entry(ambu,'notitie','[DEMO] Voorbeeldregistratie ambulancedienst.'),
    entry(dep,'activiteit','[DEMO] Voorbeeldregistratie depannage.')
  ];
}
function userEntries(uid){
  let entries=dataByUser.get(uid);
  if(!entries){entries=initialEntries();dataByUser.set(uid,entries);}
  return entries;
}
const deny=(res,message='Geen bevoegdheid voor deze DEMO-hulpdienst')=>
  res.status(403).json({error:message});
const bad=(res,e)=>res.status(400).json({error:e.message||'Ongeldige DEMO-registratie'});
const authorized=(actor,dept)=>canReadServiceDossier(actor,dept);
const filteredEntries=(actor,uid,dept,id)=>{
  if(!findDemo(dept,id)||!authorized(actor,dept))return null;
  return userEntries(uid).filter(e=>e.dept===dept&&e.subjectDiscordId===id);
};
export function installManagementDemoRoutes(app,{requireUser}){
  app.get('/api/management/demo/entries',requireUser,(req,res)=>{
    const dept=String(req.query.dept||''),id=String(req.query.discordId||'');
    const entries=filteredEntries(req.bpd,req.bpd.uid,dept,id);
    if(!entries)return deny(res);
    return res.json({demo:true,entries:entries.slice().reverse(),limited:false});
  });
  app.post('/api/management/demo/entries',requireUser,(req,res)=>{
    const actor=req.bpd,raw=req.body||{},dept=String(raw.dept||''),id=String(raw.discordId||''),type=String(raw.type||'');
    if(!findDemo(dept,id)||!authorized(actor,dept))return deny(res);
    if(dataByUser.size>300)return res.status(503).json({error:'DEMO-limiet bereikt'});
    const entries=userEntries(actor.uid);
    if(entries.length>=250)return res.status(429).json({error:'Maximaal 250 DEMO-registraties. Gebruik DEMO herstellen.'});
    const registration=type==='observatie'||type==='sanctie';
    const allowed=registration?
      Boolean(actor.dossierNativeDepartments?.includes(dept)&&maySubmit(actor,type,dept)):
      mayWriteManagement(actor,dept,type);
    if(!allowed)return deny(res,'Geen bevoegdheid voor deze dossiercategorie');
    try{
      const validated=registration?validateEntry(raw):validateManagementEntry(raw);
      if(type==='sanctie'&&!canChooseSanction(actor.role,validated.sanctionType))
        return deny(res,'Deze sanctiemaatregel is niet toegestaan');
      // DE MOET: geen opvoering namens een ander zonder geverifieerde inzendcontext.
      if(raw.onBehalfOfDiscordId)return deny(res,'Oefenregistraties namens derden zijn hier uitgeschakeld');
      const subject=findDemo(dept,id);
      const entry={...validated,id:randomUUID().replace(/-/g,''),dept,subjectDiscordId:id,
        subjectNameAtCreation:subject.name,subjectCallAtCreation:subject.call,
        registeredBy:{name:'[DEMO] Ingelogde tester',call:'TEST'},
        createdAt:new Date().toISOString(),demoRecord:true,testRecord:false};
      entries.push(entry);
      return res.status(201).json({saved:true,demo:true,reference:entry.id});
    }catch(error){return bad(res,error)}
  });
  app.patch('/api/management/demo/entries/:entryId',requireUser,(req,res)=>{
    const actor=req.bpd,entries=userEntries(actor.uid);
    const entry=entries.find(x=>x.id===req.params.entryId&&x.type==='sanctie');
    if(!entry||!authorized(actor,entry.dept))return res.status(404).json({error:'DEMO-sanctie niet gevonden'});
    if(!actor.dossierNativeDepartments?.includes(entry.dept)||!mayAmend(actor,'sanctie',entry.dept))
      return deny(res,'Alleen bevoegd officierenkader of korpsleiding mag sancties wijzigen');
    try{
      const validated=validateAmend(req.body);
      if(!canChooseSanction(actor.role,validated.sanctionType))return deny(res);
      entry.audit=entry.audit||[];
      entry.audit.push({before:structuredClone({...entry,audit:undefined}),reason:validated.amendmentReason,
        at:new Date().toISOString(),by:'[DEMO] Tester'});
      const {amendmentReason,...rest}=validated;
      Object.assign(entry,rest,{modifiedAt:new Date().toISOString(),demoRecord:true});
      return res.json({saved:true,demo:true});
    }catch(error){return bad(res,error)}
  });
  app.get('/api/management/demo/report',requireUser,(req,res)=>{
    const dept=String(req.query.dept||'');
    if(!authorized(req.bpd,dept)||!DEMO_SUBJECTS.some(x=>x.dept===dept))return deny(res);
    try{
      const start=parseDate(req.query.periodStart||day(),'begindatum');
      const end=parseDate(req.query.periodEnd||day(),'einddatum');
      if(end<start)return res.status(400).json({error:'Einddatum ligt vóór begindatum'});
      const period=1+(Date.parse(end)-Date.parse(start))/86400000;
      if(period>31)return res.status(400).json({error:'Een periode mag maximaal 31 dagen omvatten'});
      const entries=userEntries(req.bpd.uid).filter(e=>e.dept===dept);
      const sections=reportSections(entries,start,end);
      return res.json({demo:true,report:{
        id:'DEMO',title:'[DEMO] Voorbeeld-weekrapport',dept,periodStart:start,periodEnd:end,
        status:'concept',createdBy:{name:'DEMO-omgeving'}
      },sections,recordCount:sections.reduce((n,x)=>n+x.entries.length,0),excludedTestCount:0,
        truncated:false,disclaimer:'UITSLUITEND DEMO: gegevens in tijdelijk servergeheugen. Geen echte dossiers, Firestore of MAIN zijn gewijzigd.'});
    }catch(error){return bad(res,error)}
  });
  app.post('/api/management/demo/reset',requireUser,(req,res)=>{
    if(!req.bpd.dossierAllowedDepartments?.length)return deny(res);
    dataByUser.delete(req.bpd.uid);
    return res.json({reset:true,demo:true});
  });
}
