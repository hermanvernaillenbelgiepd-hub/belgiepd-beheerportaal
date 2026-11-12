// Display-only, service-specific layout settings. They NEVER assign a role,
// specialty, reekshoofd, permission or patch to a person.
import {POLICE_SPECIALTY_GROUPS} from './personnel-grouping-policy.js';
export const GROUP_DEPARTMENTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
export const GROUP_TIER_DEFAULTS=Object.freeze({
 leadership:'Leiding / Teamleaders',
 instructors:'Instructeurs / Docenten',
 members:'Volwaardige leden',
 trainees:'In opleiding / Stage'
});
export const GROUP_SERIES_DEFAULTS=Object.freeze([
 {key:'1',label:'Reeks 1',hidden:false},
 {key:'2',label:'Reeks 2',hidden:false},
 {key:'3',label:'Reeks 3',hidden:false},
 {key:'4',label:'Reeks 4',hidden:false},
 {key:'vlinder',label:'Vlinder',hidden:false},
 {key:'kader',label:'Officierenkader / Korpsleiding',hidden:false},
 {key:'overig',label:'Nog geen reeks toegewezen',hidden:false}
]);
const labelOk=s=>typeof s==='string'&&s.trim().length>=2&&s.trim().length<=72&&
 !/[<>\x00-\x1f\x7f]/.test(s);
const iconOk=s=>typeof s==='string'&&s.length<=12&&!/[<>\x00-\x1f\x7f]/.test(s);
const keyOk=s=>typeof s==='string'&&/^[A-Z0-9][A-Z0-9 /_-]{0,63}$/.test(s);
const cloneList=list=>list.map(x=>({...x}));
export function specialtyGroupKey(value,dept){
 const text=String(value||'').trim();
 if(dept==='politie'){
  // The police policy owns role aliases, not this editor.
  const canonical=policeCanonical(text);
  return canonical;
 }
 return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/[.]/g,' ').replace(/\s+/g,' ').slice(0,64);
}
import {canonicalPoliceSpecialty as policeCanonical} from './personnel-grouping-policy.js';
const defaults=(dept,registered=[])=>{
 const base=dept==='politie'?POLICE_SPECIALTY_GROUPS.map(x=>({
  key:x.key,label:x.label,icon:x.icon,hidden:false
 })):[];
 const seen=new Set(base.map(x=>x.key));
 for(const entry of registered){
  const name=String(entry||'').trim(),key=specialtyGroupKey(name,dept);
  if(!keyOk(key)||seen.has(key)||seen.size>=80)continue;
  seen.add(key);
  base.push({key,label:name.slice(0,72)||key,icon:'',hidden:false});
 }
 return base;
};
export function defaultGroupSettings(dept,registered=[]){
 if(!GROUP_DEPARTMENTS.includes(dept))throw Error('Onbekende hulpdienst');
 return {revision:0,
  series:dept==='politie'?cloneList(GROUP_SERIES_DEFAULTS):[],
  specialties:defaults(dept,registered),
  tiers:{...GROUP_TIER_DEFAULTS}};
}
export function readGroupSettings(raw,dept,registered=[]){
 const base=defaultGroupSettings(dept,registered);
 if(!raw||typeof raw!=='object')return base;
 // Invalid historical data cannot alter memberships or permissions.
 const overlay=(original,saved,isSeries)=>{
  if(!Array.isArray(saved))return original;
  const byKey=new Map(saved.filter(x=>x&&typeof x==='object'&&
   (isSeries?GROUP_SERIES_DEFAULTS.some(d=>d.key===x.key):keyOk(x.key))&&
   labelOk(x.label)&&(!('icon'in x)||iconOk(x.icon))&&typeof x.hidden==='boolean')
   .map(x=>[x.key,x]));
  const ordered=[];
  for(const entry of saved){
   const x=byKey.get(entry?.key);
   if(!x||ordered.some(y=>y.key===x.key))continue;
   ordered.push({key:x.key,label:x.label.trim(),hidden:x.hidden,
    ...(!isSeries?{icon:x.icon||''}:{})});
  }
  for(const entry of original)if(!ordered.some(x=>x.key===entry.key))
   ordered.push(entry);
  return ordered.slice(0,isSeries?7:80);
 };
 const specialties=overlay(base.specialties,raw.specialties,false);
 const series=dept==='politie'?overlay(base.series,raw.series,true):[];
 const tiers={...base.tiers};
 for(const key of Object.keys(tiers))if(labelOk(raw.tiers?.[key]))
  tiers[key]=raw.tiers[key].trim();
 return {revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0,
  series,specialties,tiers};
}
export function validateGroupSettings(payload,dept,registered=[]){
 if(!GROUP_DEPARTMENTS.includes(dept)||!payload||Array.isArray(payload)||
  typeof payload!=='object'||Object.keys(payload).some(k=>!
   ['expectedRevision','series','specialties','tiers','reason'].includes(k)))
  throw Error('Ongeldige indelingsinstellingen');
 const {expectedRevision,series,specialties,tiers,reason}=payload;
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
  throw Error('Vernieuw de instellingen en probeer opnieuw');
 if(!labelOk(reason)||reason.trim().length<8||reason.trim().length>300)
  throw Error('Geef een motivering van 8–300 tekens');
 if(!Array.isArray(series)||series.length!==(dept==='politie'?7:0)||
  !Array.isArray(specialties)||specialties.length>80||
  !tiers||Array.isArray(tiers)||typeof tiers!=='object'||
  Object.keys(tiers).sort().join(',')!==Object.keys(GROUP_TIER_DEFAULTS).sort().join(',')||
  Object.values(tiers).some(v=>!labelOk(v)))
  throw Error('Onvolledige categorieën of ongeldige kopjes');
 const allowedSeries=new Set(GROUP_SERIES_DEFAULTS.map(x=>x.key));
 const allowedSpecialties=new Set(defaults(dept,registered).map(x=>x.key));
 // Additional visual labels are only allowed for a known, recorded specialization,
 // or for a previously saved visual category. They cannot grant qualifications.
 const seriesKeys=new Set(),specialtyKeys=new Set();
 for(const entry of series){
  if(!entry||Object.keys(entry).sort().join(',')!=='hidden,key,label'||
   !allowedSeries.has(entry.key)||seriesKeys.has(entry.key)||
   !labelOk(entry.label)||typeof entry.hidden!=='boolean')
   throw Error('Ongeldige reeks');
  seriesKeys.add(entry.key);
 }
 if(dept==='politie'&&seriesKeys.size!==7)throw Error('Alle reeksen moeten behouden blijven');
 for(const entry of specialties){
  if(!entry||Object.keys(entry).sort().join(',')!=='hidden,icon,key,label'||
   !keyOk(entry.key)||!allowedSpecialties.has(entry.key)||
   specialtyKeys.has(entry.key)||!labelOk(entry.label)||
   !iconOk(entry.icon)||typeof entry.hidden!=='boolean')
   throw Error('Kies bestaande specialisaties; voeg nieuwe opleidingen toe via Rollenbeheer');
  specialtyKeys.add(entry.key);
 }
 return {expectedRevision,reason:reason.trim(),
  series:series.map(x=>({key:x.key,label:x.label.trim(),hidden:x.hidden})),
  specialties:specialties.map(x=>({key:x.key,label:x.label.trim(),
   icon:x.icon,hidden:x.hidden})),
  tiers:Object.fromEntries(Object.entries(tiers).map(([k,v])=>[k,v.trim()]))};
}
export function applyGroupSettings(groups,settings,mode){
 if(!Array.isArray(groups))return [];
 const entries=mode==='reeksen'?settings?.series:settings?.specialties;
 if(!Array.isArray(entries))return groups;
 const overrides=new Map(entries.map((x,i)=>[x.key,{...x,order:i}]));
 return groups.filter(x=>overrides.get(x.key)?.hidden!==true)
  .map((x,i)=>{
   const override=overrides.get(x.key);
   return {...x,
    ...(override?mode==='reeksen'?{title:override.label}:
     {label:override.label,icon:override.icon||x.icon}:{}),
    _order:override?.order??(1000+i)};
  }).sort((a,b)=>a._order-b._order);
}
