import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {SPECIALTY_LABELS} from './normalize.js';
import {roleForDepartment} from './leave-policy.js';
import {canEditRosterColumns} from './roster-column-config.js';
import {ROSTER_COLUMN_COLLECTION,rosterConfig} from './roster-column-config.js';
import {GROUP_DEPARTMENTS,defaultGroupSettings,readGroupSettings,
 validateGroupSettings} from '../public/personnel-group-settings-policy.js';
import {specialtyGroupKey} from '../public/personnel-group-settings-policy.js';

export const PERSONNEL_GROUP_SETTINGS_COLLECTION='bpd_personnel_group_settings';
export const PERSONNEL_GROUP_SETTINGS_AUDIT='bpd_personnel_group_settings_audit';
const ID=/^\d{15,22}$/;
export function canEditPersonnelGroupSettings(actor,dept){
 if(!GROUP_DEPARTMENTS.includes(dept)||!ID.test(String(actor?.discordId||''))||
    actor?.uid!=='discord:'+actor.discordId)return false;
 if(actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true&&
    actor.role==='beheerder')return true;
 if(dept==='politie')return canEditRosterColumns(actor);
 if(dept==='burger')return false; // council approval never grants global site settings
 return Boolean(actor.departments?.includes(dept)&&
   actor.dossierAllowedDepartments?.includes(dept)&&
   ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,dept)));
}
function knownSpecialties(dept,snapshot,custom=[]){
 const names=new Map();
 const add=value=>{
  const label=String(value||'').trim();
  const key=specialtyGroupKey(label,dept);
  if(!/^[A-Z0-9][A-Z0-9 /_-]{0,63}$/.test(key)||names.has(key))return;
  names.set(key,label);
 };
 for(const x of SPECIALTY_LABELS[dept]||[])add(x);
 for(const x of custom)add(x);
 for(const person of (snapshot?.data||[])){
  if(person?.dept!==dept)continue;
  for(const x of Array.isArray(person.specialties)?person.specialties:[])
   add(typeof x==='string'?x:x?.label);
 }
 return [...names.values()].slice(0,75);
}
export function installPersonnelGroupSettingsRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/personnel-group-settings',requireUser,async(req,res)=>{
  try{
   const db=getFirestore(),snapshot=await getSnapshot();
   const [configs,rosters]=await Promise.all([
    db.getAll(...GROUP_DEPARTMENTS.map(d=>db.collection(PERSONNEL_GROUP_SETTINGS_COLLECTION).doc(d))),
    db.getAll(...GROUP_DEPARTMENTS.filter(d=>d!=='burger')
      .map(d=>db.collection(ROSTER_COLUMN_COLLECTION).doc(d)))
   ]);
   const custom=new Map(rosters.map(doc=>[doc.id,rosterConfig(doc.data()).customSpecialties.map(x=>x.label)]));
   const settings={},canEdit={};
   for(let i=0;i<GROUP_DEPARTMENTS.length;i++){
    const dept=GROUP_DEPARTMENTS[i],doc=configs[i];
    settings[dept]=readGroupSettings(doc.data(),dept,
      [...knownSpecialties(dept,snapshot,custom.get(dept)||[]),
       ...(Array.isArray(doc.data()?.specialties)?doc.data().specialties.map(x=>x?.key):[])]);
    canEdit[dept]=canEditPersonnelGroupSettings(req.bpd,dept);
   }
   res.set('Cache-Control','private, no-store');
   res.json({settings,canEdit,displayOnly:true,stale:snapshot.stale===true});
  }catch(e){
   console.error('Indelingsinstellingen laden:',e?.code||'databasefout');
   res.status(503).json({error:'Indelingsinstellingen tijdelijk niet beschikbaar'});
  }
 });
 app.put('/api/personnel-group-settings/:dept',requireUser,async(req,res)=>{
  const dept=String(req.params.dept||'');
  if(!canEditPersonnelGroupSettings(req.bpd,dept))
   return res.status(403).json({error:'Geen geverifieerde beheertoegang voor deze hulpdienst'});
  try{
   const db=getFirestore(),snapshot=await getSnapshot();
   if(snapshot.stale)return res.status(503).json({error:'Personeelsbron niet actueel; probeer later'});
   const ref=db.collection(PERSONNEL_GROUP_SETTINGS_COLLECTION).doc(dept);
   const roster=dept==='burger'?null:
    await db.collection(ROSTER_COLUMN_COLLECTION).doc(dept).get();
   const known=knownSpecialties(dept,snapshot,
     roster?rosterConfig(roster.data()).customSpecialties.map(x=>x.label):[]);
   const result=await db.runTransaction(async tx=>{
    const beforeSnap=await tx.get(ref);
    const before=readGroupSettings(beforeSnap.data(),dept,
      [...known,...(Array.isArray(beforeSnap.data()?.specialties)?
       beforeSnap.data().specialties.map(x=>x?.key):[])]);
    const validated=validateGroupSettings(req.body,dept,
      [...known,...before.specialties.map(x=>x.key)]);
    if(validated.expectedRevision!==before.revision)
     throw Object.assign(Error('Instellingen werden gewijzigd. Vernieuw voor je opslaat.'),{status:409});
    const revision=before.revision+1;
    const next={revision,series:validated.series,specialties:validated.specialties,
      tiers:validated.tiers,updatedBy:req.bpd.discordId,
      updatedAt:FieldValue.serverTimestamp()};
    tx.set(ref,next);
    tx.create(db.collection(PERSONNEL_GROUP_SETTINGS_AUDIT).doc(),{
      department:dept,actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
      before,after:{revision,series:validated.series,
       specialties:validated.specialties,tiers:validated.tiers},
      reason:validated.reason,createdAt:FieldValue.serverTimestamp(),
      rightsChanged:false,qualificationsChanged:false
    });
    return {revision,series:validated.series,specialties:validated.specialties,tiers:validated.tiers};
   });
   res.set('Cache-Control','private, no-store');
   res.json({saved:true,settings:result,permissionsChanged:false,
     discordRolesChanged:false,personnelChanged:false});
  }catch(e){
   if(e.status)return res.status(e.status).json({error:e.message});
   if(/Ongeldige|onvolledige|reeks|specialisat|motivering|categorie|Vernieuw|bestaande|kopjes|Kies|alle reeksen|instellingen/i.test(String(e.message||'')))
    return res.status(400).json({error:e.message});
   console.error('Indelingsinstellingen opslaan:',e?.code||'databasefout');
   res.status(503).json({error:'Indelingsinstellingen niet opgeslagen'});
  }
 });
}
