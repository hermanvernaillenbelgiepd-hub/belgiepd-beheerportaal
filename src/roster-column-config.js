// Shared admin-configurable table geometry and additional specialization columns.
// This is presentation metadata, not Discord-role or access-right management.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {SPECIALTY_LABELS} from './normalize.js';
import {roleForDepartment} from './leave-policy.js';

export const ROSTER_COLUMN_COLLECTION='bpd_roster_column_settings';
export const ROSTER_DEPARTMENTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
export const ROSTER_WIDTH_DEFAULTS=Object.freeze({
 call:42,grade:68,rank:164,name:190,series:52,status:58,
 specialty:82,summary:180,file:76,discord:224
});
const columnBounds=Object.freeze({
 call:[36,200],grade:[54,250],rank:[105,380],name:[120,430],
 series:[40,240],status:[48,240],specialty:[60,220],
 summary:[110,400],file:[65,180],discord:[175,360]
});
const allowedKeys=Object.keys(ROSTER_WIDTH_DEFAULTS);
export const ROSTER_FONT_FAMILIES=Object.freeze(['inter','segoe','arial','verdana','tahoma','georgia','mono']);
export const ROSTER_FONT_DEFAULT=Object.freeze({fontFamily:'inter',fontSize:11});
const allowedBody=['expectedRevision','widths','customSpecialties','specialtyWidths','fontFamily','fontSize','reason'];
export function canEditRosterColumns(actor){
 // A real authenticated Discord identity is mandatory for all changes.
 if(!actor?.discordId||actor.uid!=='discord:'+actor.discordId)return false;
 // The approved technical profile can manage the display for all services.
 // This does not authorize any personnel, dossier or Discord mutations.
 if(actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true&&
    actor.role==='beheerder')return true;
 // Use the same fresh, verified Discord officer evidence as the existing
 // shared personnel-list layout editor, plus the actual scoped portal grant.
 return Boolean(actor.departments?.includes('politie')&&
  actor.discordRosterEditorVerified===true&&
  ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie')));
}
export function rosterConfig(value){
 const widths={...ROSTER_WIDTH_DEFAULTS};
 const candidate=value?.widths;
 if(candidate&&typeof candidate==='object'&&!Array.isArray(candidate)){
  for(const key of allowedKeys){
   const n=candidate[key],[lo,hi]=columnBounds[key];
   if(Number.isSafeInteger(n)&&n>=lo&&n<=hi)widths[key]=n;
  }
 }
 const customSpecialties=Array.isArray(value?.customSpecialties)
   ?value.customSpecialties.filter(x=>x&&typeof x.label==='string'&&
       typeof x.code==='string'&&/^[a-z0-9][a-z0-9_]{0,39}$/.test(x.code))
     .slice(0,20).map(x=>({
       label:x.label.slice(0,64),code:x.code,
       icon:typeof x.icon==='string'?x.icon.slice(0,10):'',
       public:x.public===true
     }))
   :[];
 const specialtyWidths={};
 const incoming=value?.specialtyWidths;
 if(incoming&&typeof incoming==='object'&&!Array.isArray(incoming)){
  for(const [label,width] of Object.entries(incoming))
    if(label.length<=64&&Number.isSafeInteger(width)&&width>=60&&width<=300)
      specialtyWidths[label]=width;
 }
 const fontFamily=ROSTER_FONT_FAMILIES.includes(value?.fontFamily)?
   value.fontFamily:ROSTER_FONT_DEFAULT.fontFamily;
 const fontSize=Number.isSafeInteger(value?.fontSize)&&
  value.fontSize>=9&&value.fontSize<=18?value.fontSize:ROSTER_FONT_DEFAULT.fontSize;
 return {widths,customSpecialties,specialtyWidths,fontFamily,fontSize,
  revision:Number.isSafeInteger(value?.revision)&&value.revision>=0?value.revision:0};
}
export function validateRosterConfig(input,dept){
 if(!ROSTER_DEPARTMENTS.includes(dept))throw Error('Onbekende hulpdienst');
 if(!input||Array.isArray(input)||typeof input!=='object'||
    Object.keys(input).some(k=>!allowedBody.includes(k)))
   throw Error('Ongeldige kolominstellingen');
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)
   throw Error('Vernieuw de instellingen voor je bewaart');
 // Older table editors do not provide a motivation. The central technical
 // editor does, and it must be recorded only in the audit trail.
 const reason=input.reason===undefined?'':typeof input.reason==='string'?input.reason.trim():null;
 if(reason===null||(reason!==''&&(reason.length<8||reason.length>300||
     /[<>\x00-\x1f\x7f]/.test(reason))))
   throw Error('Geef een geldige motivering van 8–300 tekens');
 const raw=input.widths;
 if(!raw||Array.isArray(raw)||typeof raw!=='object'||
    Object.keys(raw).length!==allowedKeys.length||
    Object.keys(raw).some(k=>!allowedKeys.includes(k)))
   throw Error('De kolombreedtes zijn onvolledig');
 const widths={};
 for(const key of allowedKeys){
   const n=raw[key],[lo,hi]=columnBounds[key];
   if(!Number.isSafeInteger(n)||n<lo||n>hi)
     throw Error('Ongeldige kolombreedte: '+key+' ('+lo+'–'+hi+' px)');
   widths[key]=n;
 }
 if(!Array.isArray(input.customSpecialties)||input.customSpecialties.length>20)
   throw Error('Maximum 20 bijkomende specialisaties per hulpdienst');
 const used=new Set((SPECIALTY_LABELS[dept]||[]).map(s=>s.toLocaleLowerCase('nl-BE')));
 const codes=new Set();
 const customSpecialties=input.customSpecialties.map(item=>{
   if(!item||Array.isArray(item)||typeof item!=='object'||
      Object.keys(item).some(k=>!['label','code','icon','public'].includes(k)))
     throw Error('Ongeldige bijkomende specialisatie');
   const label=typeof item.label==='string'?item.label.trim():'';
   const code=typeof item.code==='string'?item.code.trim():'';
   const icon=typeof item.icon==='string'?item.icon.trim():'';
   if(label.length<2||label.length>64||/[<>\x00-\x1f\x7f]/.test(label)||
      !/^[a-z0-9][a-z0-9_]{0,39}$/.test(code)||
      icon.length>10||/[<>\x00-\x1f\x7f]/.test(icon)||
      typeof item.public!=='boolean')
     throw Error('Gebruik een geldige naam, pictogram en code');
   const key=label.toLocaleLowerCase('nl-BE');
   if(used.has(key)||codes.has(code)||key==='lrd (recherche)')
     throw Error('Deze specialisatie bestaat al of is gereserveerd: '+label);
   used.add(key);codes.add(code);
   return {label,code,icon,public:item.public};
 });
 const rawSpecialtyWidths=input.specialtyWidths||{};
 if(!rawSpecialtyWidths||typeof rawSpecialtyWidths!=='object'||
    Array.isArray(rawSpecialtyWidths)||Object.keys(rawSpecialtyWidths).length>60)
   throw Error('Ongeldige specialisatiebreedtes');
 // Twee read-only kolommen van de publieke politielijst zijn niet aanwezig
 // als afzonderlijke bronkolom in Google Sheets. Breedtes mogen wel beheerd worden.
 const publicPoliceLabels=dept==='politie'?['INTERVENTIEDIENST','LRD (Recherche)']:[];
 const allowedSpecialtyLabels=new Set([...(SPECIALTY_LABELS[dept]||[]),
   ...publicPoliceLabels,...customSpecialties.map(x=>x.label)]);
 const specialtyWidths={};
 for(const [label,width] of Object.entries(rawSpecialtyWidths)){
   if(!allowedSpecialtyLabels.has(label)||!Number.isSafeInteger(width)||
      width<60||width>300)throw Error('Ongeldige breedte voor '+label);
   specialtyWidths[label]=width;
 }
 const fontFamily=input.fontFamily??ROSTER_FONT_DEFAULT.fontFamily;
 const fontSize=input.fontSize??ROSTER_FONT_DEFAULT.fontSize;
 if(!ROSTER_FONT_FAMILIES.includes(fontFamily)||!Number.isSafeInteger(fontSize)||
    fontSize<9||fontSize>18)
   throw Error('Gebruik een toegestaan lettertype en een lettergrootte van 9–18 px');
 return {widths,customSpecialties,specialtyWidths,fontFamily,fontSize,
  expectedRevision:input.expectedRevision,...(reason?{reason}:{})};
}
export async function loadRosterConfigs(db=getFirestore()){
 const refs=ROSTER_DEPARTMENTS.map(dept=>db.collection(ROSTER_COLUMN_COLLECTION).doc(dept));
 const snaps=await db.getAll(...refs);
 return Object.fromEntries(ROSTER_DEPARTMENTS.map((dept,i)=>
  [dept,rosterConfig(snaps[i].data())]));
}
export async function extraSpecialtyLabels(dept,db=getFirestore()){
 if(!ROSTER_DEPARTMENTS.includes(dept))return [];
 const doc=await db.collection(ROSTER_COLUMN_COLLECTION).doc(dept).get();
 return rosterConfig(doc.data()).customSpecialties.map(x=>x.label);
}
export function installRosterColumnRoutes(app,{requireUser}){
 app.get('/api/roster-columns',requireUser,async(req,res)=>{
  try{
   res.set('Cache-Control','private, no-store');
   res.json({departments:await loadRosterConfigs(),
      canEdit:canEditRosterColumns(req.bpd)});
  }catch(e){
   console.error('Kolominstellingen laden:',e?.code||'databasefout');
   res.status(503).json({error:'Kolominstellingen tijdelijk niet beschikbaar'});
  }
 });
 app.put('/api/roster-columns/:dept',requireUser,async(req,res)=>{
  if(!canEditRosterColumns(req.bpd))
   return res.status(403).json({error:'Alleen geverifieerd Officierenkader en Korpsleiding mogen kolommen beheren'});
  let validated;
  try{validated=validateRosterConfig(req.body,req.params.dept);}
  catch(e){return res.status(400).json({error:e.message});}
  try{
   const db=getFirestore(),ref=db.collection(ROSTER_COLUMN_COLLECTION).doc(req.params.dept);
   const revision=await db.runTransaction(async tx=>{
    const previous=await tx.get(ref);
    const old=rosterConfig(previous.data());
    if(old.revision!==validated.expectedRevision)
     throw Object.assign(new Error('Instellingen werden intussen gewijzigd. Vernieuw de pagina.'),{status:409});
    const next=old.revision+1;
    tx.set(ref,{widths:validated.widths,specialtyWidths:validated.specialtyWidths,
     fontFamily:validated.fontFamily,fontSize:validated.fontSize,
     customSpecialties:validated.customSpecialties,
     revision:next,updatedBy:req.bpd.discordId,updatedAt:FieldValue.serverTimestamp()});
    tx.create(db.collection('bpd_roster_column_audit').doc(),{
     dept:req.params.dept,actorDiscordId:req.bpd.discordId,
     before:old,after:(({
       expectedRevision:discardRevision,reason:discardReason,...settings
      })=>settings)(validated),
     ...(validated.reason?{reason:validated.reason}:{}),
     at:FieldValue.serverTimestamp()});
    return next;
   });
   res.json({saved:true,config:{widths:validated.widths,
    specialtyWidths:validated.specialtyWidths,fontFamily:validated.fontFamily,
    fontSize:validated.fontSize,
    customSpecialties:validated.customSpecialties,revision}});
  }catch(e){
   if(e.status)return res.status(e.status).json({error:e.message});
   console.error('Kolominstellingen opslaan:',e?.code||'databasefout');
   res.status(503).json({error:'Kolominstellingen niet opgeslagen'});
  }
 });
}
