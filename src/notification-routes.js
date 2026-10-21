import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {roleForDepartment} from './leave-policy.js';
import {policeScope,policeSeriesHeads,normalizeSeries,warningFor,afterLeave,
  isPoliceMember,leaveAuthority,monthlyActivityStatus,periodsForActor,currentFortnight,periodAt,utcDay,subjectPoliceGrade} from './notification-policy.js';
const stamp=()=>new Date().toISOString().slice(0,10);
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
        message:'Op dag '+warn.due+' volgt '+warn.label+'. Controleer eerst verlof en activiteit.',call:p.call});
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
