// Per-page visual studio: fixed targets and vetted values, never raw CSS.
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const PAGE_DESIGN_COLLECTION='bpd_portal_page_design';
export const PAGE_DESIGN_AUDIT='bpd_portal_page_design_audit';
const PUBLIC_DIR=fileURLToPath(new URL('../public/',import.meta.url));
const PAGE_NAME=/^[a-z][a-z0-9-]{0,62}\.html$/;
const COLOR=/^#[0-9a-fA-F]{6}$/;
const RADIUS=[0,4,8,12,16,20,24,28,32];
const SPACES=[0,4,8,12,16,20,24,28,32,36,40];
const SIZES=[11,12,13,14,15,16,17,18,20,22,24,26,28,30,32];
const WIDTHS=['default','narrow','regular','wide','full'];
const FONTS=['inherit','inter','system','arial','georgia','verdana','trebuchet','tahoma'];
const WEIGHTS=['inherit','normal','medium','bold'];
const COLUMNS=['auto','one','two','three','four'];
const MIN_COLUMNS=[140,160,180,200,220,240,260,280,300,320,360,400];
export const PAGE_DESIGN_FIELDS=Object.freeze({
 lightBg:'color',darkBg:'color',lightText:'color',darkText:'color',
 lightBorder:'color',darkBorder:'color',
 radius:RADIUS,padding:SPACES,fontSize:SIZES,fontFamily:FONTS,
 fontWeight:WEIGHTS,width:WIDTHS,gridGap:SPACES,minColumnWidth:MIN_COLUMNS,
 columns:COLUMNS
});
export const PAGE_DESIGN_TARGETS=Object.freeze([
 'page','cards','buttons','headings','fields','grid',
 ...Array.from({length:60},(_,i)=>'card-'+(i+1))
]);
const TARGETS=new Set(PAGE_DESIGN_TARGETS);
const KEYS=Object.keys(PAGE_DESIGN_FIELDS);
const err=(message,status=400)=>Object.assign(Error(message),{status});
export function listDesignPages(){
 // Every current and future HTML page is recognized without giving a client
 // access to server-side files. The emergency board has an independent palette.
 return readdirSync(PUBLIC_DIR).filter(name=>PAGE_NAME.test(name)&&
  name!=='to-dienstbord.html').sort();
}
export function validDesignPage(page,pages=listDesignPages()){
 return typeof page==='string'&&PAGE_NAME.test(page)&&pages.includes(page);
}
function validateValue(field,value){
 if(value===null)return true;
 const rule=PAGE_DESIGN_FIELDS[field];
 if(rule==='color')return typeof value==='string'&&COLOR.test(value);
 return Array.isArray(rule)&&rule.includes(value);
}
export function cleanPageDesign(raw){
 const found=Array.isArray(raw?.overrides)?raw.overrides:[];
 const overrides=[];
 const seen=new Set();
 for(const item of found.slice(0,66)){
  if(!item||!TARGETS.has(item.target)||seen.has(item.target))continue;
  seen.add(item.target);
  if(!item.values||typeof item.values!=='object')continue;
  const values={};
  for(const key of KEYS){
   if(Object.hasOwn(item.values,key)&&validateValue(key,item.values[key])&&
    item.values[key]!==null)values[key]=item.values[key];
  }
  if(Object.keys(values).length)overrides.push({target:item.target,values});
 }
 return {overrides};
}
export function validatePageDesignWrite(page,raw,pages=listDesignPages()){
 if(!validDesignPage(page,pages))throw err('Onbekende of beveiligde portaalpagina',404);
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).some(k=>!['overrides','expectedRevision','reason'].includes(k))||
  !['overrides','expectedRevision','reason'].every(k=>Object.hasOwn(raw,k)))
  throw err('Ongeldig vormgevingsdocument');
 if(!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)
  throw err('Versie ongeldig: herlaad de pagina');
 const reason=typeof raw.reason==='string'?raw.reason.trim():'';
 if(reason.length<10||reason.length>240||/[\x00-\x1f\x7f<>]/.test(reason))
  throw err('Motivering van 10–240 tekens verplicht');
 if(!Array.isArray(raw.overrides)||raw.overrides.length>66)
  throw err('Te veel stijlonderdelen');
 const targets=new Set(),overrides=[];
 for(const item of raw.overrides){
  if(!item||typeof item!=='object'||Array.isArray(item)||
   Object.keys(item).length!==2||
   !Object.hasOwn(item,'target')||!Object.hasOwn(item,'values')||
   !TARGETS.has(item.target)||targets.has(item.target))
   throw err('Kies unieke toegelaten kaders of paginadelen');
  targets.add(item.target);
  const v=item.values;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>KEYS.length||
   Object.keys(v).some(key=>!KEYS.includes(key)||!validateValue(key,v[key])))
   throw err('Kleuren, afmetingen of lettertypes buiten de toegestane waarden');
  const values=Object.fromEntries(Object.entries(v).filter(([,value])=>value!==null));
  // Text must remain readable if both text and background are configured.
  for(const [bg,fg] of [['lightBg','lightText'],['darkBg','darkText']]){
   if(values[bg]&&values[fg]&&contrast(values[bg],values[fg])<4.5)
    throw err('Tekst en achtergrond hebben onvoldoende contrast (minimaal 4,5:1)');
  }
  if(Object.keys(values).length)overrides.push({target:item.target,values});
 }
 return {expectedRevision:raw.expectedRevision,reason,overrides};
}
function luminance(hex){
 const parts=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const [r,g,b]=parts.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
}
export function contrast(a,b){
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function equalPageDesign(a,b){
 return JSON.stringify(cleanPageDesign(a))===JSON.stringify(cleanPageDesign(b));
}
