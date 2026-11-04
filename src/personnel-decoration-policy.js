import {roleForDepartment} from './leave-policy.js';
import {validPersonnelKey} from './personnel-editor-policy.js';

export const PERSONNEL_DECORATIONS_COLLECTION='bpd_personnel_decorations';
export const PERSONNEL_DECORATION_CATALOG_COLLECTION='bpd_personnel_decoration_catalog';
const CUSTOM_ID=/^custom_[0-9a-f-]{36}$/i;
export const isCustomDecorationId=id=>typeof id==='string'&&CUSTOM_ID.test(id);
export function customCatalogItem(doc){
 const o=doc?.data?.()||doc||{},id=String(doc?.id||o.id||'');
 if(!isCustomDecorationId(id)||o.disabled===true||typeof o.label!=='string'||
  !['ribbon','medal','badge'].includes(o.kind)||o.label.length<3||o.label.length>80)return null;
 return {id,label:o.label,kind:o.kind,color:typeof o.color==='string'?o.color:'blue',
  priority:Number.isInteger(o.priority)?o.priority:150,
  imageUrl:'/api/personnel-awards/catalog-image/'+id};
}
export const lookupCatalog=(id,extras)=>
 (extras instanceof Map?extras.get(id):null)||CATALOG_BY_ID.get(id);

export const DECORATION_CATALOG=Object.freeze([
 {id:'kroon_blauw',label:'Blauw erelint met kroon',kind:'medal',color:'blue',priority:10},
 {id:'ereteken_zilver',label:'Zilveren erekruis',kind:'medal',color:'silver',priority:20},
 {id:'ereteken_rood',label:'Rood erekruis',kind:'medal',color:'red',priority:30},
 {id:'pen_zilver',label:'Zilveren pen-onderscheiding',kind:'badge',color:'silver',priority:40},
 {id:'dienstmedaille_zilver',label:'Zilveren dienstmedaille',kind:'medal',color:'silver',priority:50},
 {id:'dienstmedaille_goud',label:'Gouden dienstmedaille',kind:'medal',color:'gold',priority:60},
 {id:'lint_blauw_goud',label:'Dienstlint blauw-goud',kind:'ribbon',color:'blue-gold',priority:70},
 {id:'lint_rood_goud',label:'Dienstlint rood-goud',kind:'ribbon',color:'red-gold',priority:80},
 {id:'lint_blauw_wit',label:'Dienstlint blauw-wit',kind:'ribbon',color:'blue-white',priority:90},
 {id:'lint_rood_zwart',label:'Dienstlint rood-zwart',kind:'ribbon',color:'red-black',priority:100},
 {id:'lint_blauw_zilver',label:'Dienstlint blauw-zilver',kind:'ribbon',color:'blue-silver',priority:110},
 {id:'lint_blauw_goud_breed',label:'Dienstlint blauw met gouden middenstreep',kind:'ribbon',color:'gold-blue',priority:120}
]);
export const CATALOG_BY_ID=new Map(DECORATION_CATALOG.map(v=>[v.id,v]));
// Built-in labels can be edited without changing their stable catalogue IDs.
// Custom entries retain their images and existing personnel grants.
export function catalogLabelOverrideItem(doc){
 const o=doc?.data?.()||doc||{},id=String(doc?.id||o.id||'');
 const base=CATALOG_BY_ID.get(id),label=typeof o.label==='string'?o.label.trim():'';
 if(!base||o.disabled===true||label.length<3||label.length>80||
    /[<>\x00-\x1f\x7f]/.test(label))return null;
 return {...base,label};
}
export function decorationCatalogExtras(docs){
 return new Map((Array.isArray(docs)?docs:[])
  .map(doc=>[doc.id,customCatalogItem(doc)||catalogLabelOverrideItem(doc)])
  .filter(([,item])=>item));
}
const ID=/^\d{15,22}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export const brusselsToday=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
const validDate=s=>typeof s==='string'&&DATE.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&
 new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function validateDecoration(payload,today=brusselsToday(),catalog=CATALOG_BY_ID){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   Object.keys(payload).some(k=>!['catalogId','startDate','endDate','public','reason'].includes(k)))
   throw Error('Ongeldige onderscheidinggegevens');
 if(!catalog.has(payload.catalogId))throw Error('Kies een bekende onderscheiding');
 const startDate=payload.startDate||today,endDate=payload.endDate||null;
 if(!validDate(startDate)||endDate!==null&&!validDate(endDate)||
    endDate!==null&&endDate<startDate)throw Error('Controleer de geldigheidsdatums');
 if(startDate<today)throw Error('Toekennen met een historische startdatum is niet toegestaan');
 if(endDate&&endDate<today)throw Error('Einddatum mag niet verstreken zijn');
 if(typeof payload.public!=='boolean')throw Error('Kies publiek zichtbaar of intern');
 const reason=typeof payload.reason==='string'?payload.reason.trim():'';
 if(reason.length<10||reason.length>500||/[\x00-\x1f\x7f<>]/.test(reason))
   throw Error('Motivering van 10 tot 500 tekens vereist');
 return {catalogId:payload.catalogId,startDate,endDate,public:payload.public,reason};
}
export function canManagePoliceDecorationCatalog(actor){
 if(!ID.test(actor?.discordId||'')||actor?.uid!=='discord:'+actor.discordId||
    actor.portalTechnicalMode===true)return false;
 return Boolean(actor?.departments?.includes('politie')&&
    actor?.dossierNativeDepartments?.includes('politie')&&
    actor?.dossierAllowedDepartments?.includes('politie')&&
    ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'))&&
    ['officierenkader','korpsleiding'].includes(actor?.role));
}
export function canManagePoliceDecoration(actor,subject){
 // Award administration is deliberately separate from reading or editing
 // restricted 9xx dossiers. Verified police officers/corps may award any
 // uniquely identified police member, including Korpsleiding.
 // Never extend dossier-read, personnel-edit or Discord-role permissions.
 return Boolean(subject&&subject.dept==='politie'&&
  validPersonnelKey('politie',subject.personId)&&
  canManagePoliceDecorationCatalog(actor));
}
export const awardKey=(dept,id)=>validPersonnelKey(dept,id)?dept+'_'+id:null;
export function isDecorationActive(entry,today=brusselsToday()){
 return Boolean(entry&&!entry.revokedAt&&validDate(entry.startDate)&&entry.startDate<=today&&
   (!entry.endDate||validDate(entry.endDate)&&entry.endDate>=today));
}
export function publicDecorations(entries,today=brusselsToday(),extras=new Map()){
 return (Array.isArray(entries)?entries:[])
  .filter(a=>a?.public===true&&isDecorationActive(a,today)&&lookupCatalog(a.catalogId,extras))
  .sort((a,b)=>lookupCatalog(a.catalogId,extras).priority-lookupCatalog(b.catalogId,extras).priority)
  .slice(0,30).map(a=>({...lookupCatalog(a.catalogId,extras)}));
}
export function manageDecorations(entries,today=brusselsToday(),extras=new Map()){
 return (Array.isArray(entries)?entries:[]).filter(a=>a&&lookupCatalog(a.catalogId,extras))
  .map(a=>({id:a.id,catalogId:a.catalogId,
    label:lookupCatalog(a.catalogId,extras).label,public:a.public===true,
    startDate:a.startDate,endDate:a.endDate||null,reason:a.reason,
    state:a.revokedAt?'ingetrokken':isDecorationActive(a,today)?'actief':
       a.startDate>today?'gepland':'verlopen',revokedAt:a.revokedAt||null}))
  .slice(-100).reverse();
}
export function expirationDate(date){
 if(!validDate(date))return null;
 const d=new Date(date+'T00:00:00Z');
 d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
}
