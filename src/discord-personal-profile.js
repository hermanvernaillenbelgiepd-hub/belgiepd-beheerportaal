import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {verifiedDiscordIdentity} from './user-access.js';
import {recognizeRoles} from './role-catalog.js';
import {isDiscordId} from './discord-utils.js';
import {isArchivedTraining} from './training-maintenance.js';
import {DOSSIER_DEPTS} from './dossier-grants.js';

// All records belong to the authenticated Discord ID. Never accept a target
// ID, chosen department, or other identity from the browser.
const clean=(v,max=100)=>String(v??'').trim().slice(0,max);
const activeSpecialty=value=>!['','Nee','Neen','Niet ingevuld','NVT','n.v.t.','Geen'].includes(clean(value,30));
export function personalProfileView(id,member,roster=[],trainingDocs=[]){
  const roles=recognizeRoles(member?.roleIds||[]).map(r=>({
    name:clean(r.name,80),department:r.dept,kind:r.kind,stage:r.stage,roleId:r.id
  }));
  const people=roster.filter(p=>p?.personId===id&&DOSSIER_DEPTS.includes(p.dept));
  const staff=people.map(p=>({department:p.dept,name:clean(p.name,100),
    call:clean(p.call,40),rank:clean(p.rank,90),
    specializations:(Array.isArray(p.specialties)?p.specialties:[])
      .filter(s=>typeof s?.label==='string'&&activeSpecialty(s.value)).slice(0,20)
      .map(s=>({name:clean(s.label,64),status:clean(s.value,80)}))}));
  const training=trainingDocs.filter(d=>
    DOSSIER_DEPTS.includes(d?.department)&&
    d?.subjectDiscordId===id&&!isArchivedTraining(d)&&
    ['geslaagd','niet_geslaagd','in_opleiding'].includes(d?.result)
  ).slice(0,200).map(d=>({
    department:d.department,
    name:clean(d.courseName,150),
    date:/^\d{4}-\d{2}-\d{2}$/.test(d.eventDate)?d.eventDate:null,
    result:d.result
  })).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return {discordId:id,roles,staff,training,
    // A role may indicate a specialization without a personnel qualification.
    discordSpecializations:roles.filter(r=>r.kind==='specialisatie')
      .map(r=>({name:r.name,department:r.department,stage:r.stage,roleId:r.roleId}))};
}
export function installDiscordPersonalProfileRoutes(app,{getSnapshot}){
  app.get('/api/discord/personal-profile',async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    const match=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
    if(!match)return res.status(401).json({error:'Meld je aan met je eigen Discord-account'});
    let id,member;
    try{
      const decoded=await getAuth().verifyIdToken(match[1]);
      id=decoded.uid?.startsWith('discord:')?decoded.uid.slice(8):'';
      if(!isDiscordId(id))return res.status(403).json({error:'Gebruik je eigen Discord-login'});
      const doc=await getFirestore().collection('bpd_discord_auth').doc(id).get();
      member=doc.data();
      if(verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID)!==id)
        return res.status(403).json({error:'Vernieuw eerst je Discord-verificatie via de bot of meld opnieuw aan'});
    }catch{return res.status(401).json({error:'Discord-verificatie is niet beschikbaar'})}
    const store=getFirestore();
    const rosterCall=getSnapshot().then(snapshot=>
      snapshot.stale?{staff:[],unavailable:true}:{staff:snapshot.data,unavailable:false}
    ).catch(()=>({staff:[],unavailable:true}));
    const trainingCall=Promise.all(DOSSIER_DEPTS.map(dept=>
      store.collection('bpd_training').doc(dept+'_'+id).collection('records')
        .orderBy('createdAt','desc').limit(50).get().then(q=>
          q.docs.map(doc=>({department:dept,subjectDiscordId:id,...doc.data()})))
    )).then(groups=>({records:groups.flat(),unavailable:false}))
      .catch(()=>({records:[],unavailable:true}));
    const [personnel,trainings]=await Promise.all([rosterCall,trainingCall]);
    const result=personalProfileView(id,member,personnel.staff,trainings.records);
    return res.json({...result,personnelUnavailable:personnel.unavailable,
      trainingUnavailable:trainings.unavailable,
      readOnly:true,limitedTraining:trainings.records.length>=200});
  });
}
