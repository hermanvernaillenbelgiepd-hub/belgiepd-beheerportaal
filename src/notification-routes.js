import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {roleForDepartment} from './leave-policy.js';
import {policeScope,policeSeriesHeads,normalizeSeries,warningFor,afterLeave,
  isPoliceMember,leaveAuthority,monthlyActivityStatus,periodsForActor,currentFortnight,periodAt,utcDay,subjectPoliceGrade} from './notification-policy.js';
const stamp=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=name=>parts.find(p=>p.type===name)?.value;return [part('year'),part('month'),part('day')].join('-')};
const mapped=s=>(s?.docs||[]).map(d=>({id:d.id,...d.data()}));
const writes=()=>process.env.FIREBASE_PROJECT_ID==='belgiepd-test'&&process.env.BPD_ENABLE_NOTIFICATIONS_WRITES==='true';
const safeId=x=>/^[A-Za-z0-9_-]{4,180}$/.test(String(x));
export function installNotificationRoutes(app,{requireUser,getSnapshot,firestore=()=>getFirestore(),today=stamp}){
  const db=firestore;
  const notices=()=>db().collection('bpd_notification_actions');
  const roster=async()=>{const s=await getSnapshot();if(!Array.isArray(s.data))throw Error('Personeelsgegevens ontbreken');return s.data};
  async function inbox(actor){
    const people=await roster(),scope=policeScope(actor,policeSeriesHeads(process.env));
    if(!scope.role)return {items:[],scope};
    const snaps=await Promise.all([
      db().collection('bpd_leave_requests').limit(500).get(),
      db().collection('bpd_callsign_requests').limit(300).get(),
      db().collection('bpd_leave_returns').limit(500).get(),
      db().collection('bpd_training_sessions').limit(200).get(),
      db().collection('bpd_monthly_activity').limit(500).get(),
      notices().limit(500).get()
    ]);
    if(snaps.some(s=>s.size===500||s.size===300||s.size===200))throw Error('Onvolledig overzicht');
    const [leaves,calls,returns,courses,months,actions]=snaps.map(mapped);
    const dismissed=new Set(actions.filter(x=>x.action==='dismissed').map(x=>x.id));
    const returned=new Set(returns.map(x=>x.id));
    const member=people.find(x=>isPoliceMember(actor,x)),date=today(),month=date.slice(0,7),items=[];
    const add=x=>{if(!dismissed.has(x.id))items.push(x)};
    for(const p of people.filter(p=>p.dept==='politie'&&scope.series.includes(normalizeSeries(p)))){
      const series=normalizeSeries(p),warn=warningFor(p);
      if(warn)add({id:'inactive_'+p.personId+'_'+warn.warn,kind:'inactivity',series,subjectId:p.personId,
        title:p.name+' · '+warn.days+' dagen inactief',
        message:(warn.days>=warn.due?'Drempel dag '+warn.due+' bereikt voor '+warn.label+'.':'Vanaf dag '+warn.due+' volgt '+warn.label+'.')+' Controleer eerst verlof en activiteit. Er volgt geen automatische uitschrijving.',call:p.call});
      const activity=months.find(m=>m.discordId===p.personId&&m.month===month&&m.sourceVerified===true);
      const status=monthlyActivityStatus(activity?.hours);
      if(status&&status!=='Actief')add({id:'monthly_'+month+'_'+p.personId,kind:'monthly',series,subjectId:p.personId,
        title:p.name+' · maandactiviteit '+status,message:String(activity.hours)+' uren in '+month,
        call:p.call});
    }
    for(const l of leaves){
      if(!l.subjectDepartments?.includes('politie'))continue;
      const p=people.find(x=>x.dept==='politie'&&x.personId===l.personDiscordId);
      if(!p)continue;
      const series=normalizeSeries(p);
      if(l.status==='pending'&&leaveAuthority(actor,l,p))
        add({id:'leave_request_'+l.id,kind:'leave_request',series,subjectId:p.personId,
          title:'Verlofaanvraag · '+p.name,message:l.startDate+' t/m '+l.endDate,
          link:'/verlofbeheer.html',call:p.call});
      if(!afterLeave(l,date))continue;
      if(isPoliceMember(actor,p)&&!returned.has(l.id))
        add({id:'return_self_'+l.id,kind:'return_self',subjectId:p.personId,series,
          title:'Welkom terug uit uw verlofperiode',
          message:'Gelieve uw terugkeer te bevestigen aan uw reekshoofden.',leaveId:l.id});
      if(series&&scope.series.includes(series))
        add({id:'leave_finished_'+l.id,kind:'leave_finished',subjectId:p.personId,series,
          title:p.name+' · verlofperiode afgelopen',call:p.call,
          message:returned.has(l.id)?'Terugkeer bevestigd':'Wacht op terugkeerbevestiging',confirmed:returned.has(l.id)});
    }
    if(['officierenkader','korpsleiding'].includes(scope.role))
      for(const c of calls)if(['submitted','verified','needs_verification'].includes(c.status))
        add({id:'callsign_'+(c.discordId||c.id),kind:'callsign',subjectId:c.discordId||c.id,
          title:'Vast roepnummer · '+String(c.name||'').slice(0,80),
          message:'Tijdelijk '+c.temporaryCall+' · '+c.status,link:'/roepnummers.html'});
    if(member&&subjectPoliceGrade(member)==='basiskader')
      for(const course of courses){
        if(course.dept!=='politie'||course.status!=='gepland'||
          typeof course.startDate!=='string'||course.startDate<date||
          course.startDate>new Date(utcDay(date)+60*86400000).toISOString().slice(0,10))continue;
        if(course.targetDiscordIds?.length&&!course.targetDiscordIds.includes(member.personId))continue;
        if(course.targetSeries?.length&&!course.targetSeries.includes(normalizeSeries(member)))continue;
        add({id:'training_'+course.id,kind:'training',subjectId:member.personId,
          title:'Komende opleiding · '+String(course.title||'').slice(0,110),
          message:course.startDate+' · '+String(course.location||'').slice(0,100)});
      }
    return {items:items.slice(0,220),limited:items.length>220,scope};
  }
  app.get('/api/notifications/me',requireUser,async(req,res)=>{
    try{res.set('Cache-Control','private, no-store');res.json({...await inbox(req.bpd),writesEnabled:writes()});}
    catch(e){console.error('Meldingen:',e.message);res.status(503).json({error:'Meldingen niet beschikbaar'});}
  });
  app.post('/api/notifications/return/:id',requireUser,async(req,res)=>{
    if(!writes())return res.status(503).json({error:'Bevestigingen zijn op TEST nog niet ingeschakeld'});
    if(!safeId(req.params.id))return res.status(400).json({error:'Ongeldige verlofverwijzing'});
    try{
      const people=await roster(),person=people.find(p=>isPoliceMember(req.bpd,p));
      if(!person)return res.status(403).json({error:'Geen eigen politiepersoneelsfiche'});
      const id=req.params.id,source=db().collection('bpd_leave_requests').doc(id);
      const confirmed=db().collection('bpd_leave_returns').doc(id);
      const event=db().collection('bpd_weekreport_events').doc('return_'+id);
      await db().runTransaction(async tx=>{
        const [old,leave]=await Promise.all([tx.get(confirmed),tx.get(source)]);
        if(old.exists)throw Object.assign(Error('Terugkeer is al bevestigd'),{status:409});
        if(!leave.exists||leave.get('personDiscordId')!==person.personId||!afterLeave(leave.data(),today()))
          throw Object.assign(Error('Geen geldige verlopen eigen verlofperiode'),{status:403});
        const at=FieldValue.serverTimestamp();
        tx.create(confirmed,{discordId:person.personId,leaveId:id,series:normalizeSeries(person),confirmedAt:at});
        tx.create(event,{eventDate:today(),type:'return_confirmed',subjectId:person.personId,
          subjectName:person.name,subjectCall:person.call,series:normalizeSeries(person),
          byDiscordId:person.personId,details:'Terugkeer na verlof bevestigd',at});
      });
      res.json({confirmed:true});
    }catch(e){res.status(e.status||503).json({error:e.status?e.message:'Bevestiging mislukt'});}
  });
  app.post('/api/notifications/:id/dismiss',requireUser,async(req,res)=>{
    if(!writes())return res.status(503).json({error:'Afhandelen van meldingen staat uit'});
    const reason=req.body?.reason,id=req.params.id;
    if(!safeId(id)||typeof reason!=='string'||reason.trim().length<4||reason.trim().length>500)
      return res.status(400).json({error:'Geef een opvolging van 4–500 tekens op'});
    try{
      const data=await inbox(req.bpd),item=data.items.find(x=>x.id===id);
      if(!item||['return_self','training'].includes(item.kind))
        return res.status(403).json({error:'Geen bevoegdheid over deze melding'});
      const doc=notices().doc(id),event=db().collection('bpd_weekreport_events').doc('dismiss_'+id);
      await db().runTransaction(async tx=>{
        const old=await tx.get(doc);
        if(old.exists)throw Object.assign(Error('Melding reeds door een collega afgehandeld'),{status:409});
        const at=FieldValue.serverTimestamp();
        tx.create(doc,{action:'dismissed',kind:item.kind,series:item.series||null,
          subjectId:item.subjectId||null,at,byDiscordId:req.bpd.discordId,reason:reason.trim()});
        tx.create(event,{eventDate:today(),type:'notification_dismissed',subjectId:item.subjectId,
          subjectName:item.title.slice(0,120),subjectCall:item.call||'—',
          series:item.series||null,byDiscordId:req.bpd.discordId,details:reason.trim(),at});
      });
      res.json({dismissed:true,weekreportLogged:true});
    }catch(e){res.status(e.status||503).json({error:e.status?e.message:'Afhandeling mislukt'});}
  });
  app.get('/api/notifications/periods',requireUser,(req,res)=>{
    const periods=periodsForActor(today(),req.bpd);
    if(!periods.length)return res.status(403).json({error:'Geen inzage in weekrapporten'});
    res.json({periods,canSave:['officierenkader','korpsleiding'].includes(roleForDepartment(req.bpd,'politie'))});
  });
  async function reportEvents(period,scope){
    const snap=await db().collection('bpd_weekreport_events').limit(1500).get();
    if(snap.size===1500)throw Error('Rapportlog is te groot voor een volledige controle');
    return mapped(snap).filter(x=>x.eventDate>=period.start&&x.eventDate<=period.end&&
      (scope.series.includes(x.series)||['officierenkader','korpsleiding'].includes(scope.role)&&x.series==null))
      .map(x=>({eventDate:x.eventDate,type:x.type,subjectName:x.subjectName,
        subjectCall:x.subjectCall,series:x.series,byDiscordId:x.byDiscordId,details:x.details}))
      .sort((x,y)=>String(x.eventDate).localeCompare(String(y.eventDate)));
  }
  app.get('/api/notifications/periods/:start',requireUser,async(req,res)=>{
    try{
      const period=periodsForActor(today(),req.bpd).find(x=>x.start===req.params.start);
      if(!period)return res.status(403).json({error:'Deze periode is niet toegankelijk'});
      const scope=policeScope(req.bpd,policeSeriesHeads(process.env));
      const saved=await db().collection('bpd_fortnight_reports').doc(period.start).get();
      const all=saved.exists&&Array.isArray(saved.get('events'))?
        saved.get('events'):await reportEvents(period,scope);
      const events=all.filter(e=>scope.series.includes(e.series)||
        ['officierenkader','korpsleiding'].includes(scope.role)&&e.series==null);
      res.json({period,events,saved:saved.exists,canSaveNow:today()>period.end});
    }catch(e){res.status(503).json({error:'Rapport niet beschikbaar'});}
  });
  app.post('/api/notifications/periods/:start/save',requireUser,async(req,res)=>{
    if(!writes())return res.status(503).json({error:'Rapport opslaan is nog niet ingeschakeld'});
    const scope=policeScope(req.bpd,policeSeriesHeads(process.env));
    if(!['officierenkader','korpsleiding'].includes(scope.role))
      return res.status(403).json({error:'Alleen officierenkader en korpsleiding kunnen opslaan'});
    const period=periodsForActor(today(),req.bpd).find(x=>x.start===req.params.start);
    if(!period)return res.status(403).json({error:'Rapportperiode niet beschikbaar'});
    if(today()<=period.end)return res.status(409).json({error:'De lopende rapportperiode kan nog niet worden afgesloten'});
    try{
      const events=await reportEvents(period,scope);
      if(events.length>500||JSON.stringify(events).length>600000)
        return res.status(503).json({error:'Rapport bevat te veel gegevens om veilig op te slaan'});
      await db().collection('bpd_fortnight_reports').doc(period.start)
        .create({...period,dept:'politie',status:'opgeslagen',events,eventCount:events.length,
          savedByDiscordId:req.bpd.discordId,savedAt:FieldValue.serverTimestamp()});
      res.status(201).json({saved:true,entries:events.length});
    }catch(e){res.status(e.code===6?409:503).json({error:e.code===6?'Reeds opgeslagen':'Opslaan mislukt'});}
  });
}
