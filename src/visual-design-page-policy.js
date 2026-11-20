// Strict policy for page/section visual customization; no arbitrary CSS or selectors.
export const DESIGN_PAGE_COLLECTION='bpd_portal_visual_design_pages';
export const DESIGN_PAGE_AUDIT='bpd_portal_visual_design_page_audit';
export const DESIGN_PAGE_CATALOG=Object.freeze([{"key":"index","label":"Startpagina"},{"key":"activiteitscentrum","label":"Activiteitscentrum"},{"key":"beeldbibliotheek","label":"Beeldbibliotheek"},{"key":"beheercentrum","label":"Beheercentrum"},{"key":"brandweerdossier","label":"Brandweerdossier"},{"key":"bronnen","label":"Bronnen"},{"key":"burger-personeelsdossiers","label":"Burgerdossiers"},{"key":"dc-id-overdracht","label":"DC-ID overdracht"},{"key":"discord-diagnose","label":"Discord-diagnose"},{"key":"discord-status","label":"Mijn profiel"},{"key":"documentencentrum","label":"Documentencentrum"},{"key":"dossiercentrum","label":"Dossiercentrum"},{"key":"gebruikersbeheer","label":"Gebruikersbeheer"},{"key":"koppelritten","label":"Koppelritten"},{"key":"meldingen","label":"Meldingen"},{"key":"opleidingscentrum","label":"Opleidingscentrum"},{"key":"opleidingskalender","label":"Opleidingskalender"},{"key":"opleidingsplanning","label":"Opleidingsplanning"},{"key":"opleidingstraject","label":"Opleidingstraject"},{"key":"organogram-hierarchie","label":"Organogram hiërarchie"},{"key":"organogram","label":"Organogram"},{"key":"personeel-koppelen","label":"Personeel koppelen"},{"key":"personeelsbeheer","label":"Personeelslijst"},{"key":"personeelslijst","label":"Personeelslijst (alternatief)"},{"key":"registraties","label":"Observaties basiskader"},{"key":"roepnummers","label":"Roepnummers"},{"key":"rollen-opleidingen","label":"Rollen en opleidingen"},{"key":"rollenbeheer","label":"Rollenbeheer"},{"key":"sanctieoverzicht","label":"Sanctieoverzicht"},{"key":"technische-rollen-simulatie","label":"Technische testrollen"},{"key":"testgegevens-opschonen","label":"Testgegevens opschonen"},{"key":"to-dienstbord","label":"TO-dienstbord"},{"key":"toegangsvoorbeeld","label":"Toegangsvoorbeeld"},{"key":"vast-roepnummer-aanvragen","label":"Vast roepnummer"},{"key":"verlofbeheer","label":"Verlofbeheer"},{"key":"voltooide-opleidingen","label":"Voltooide opleidingen"},{"key":"weekrapporten","label":"Weekrapporten"},{"key":"vormgeving","label":"Vormgeving"}]);
const KEYS=new Set(DESIGN_PAGE_CATALOG.map(x=>x.key));
export const DESIGN_PAGE_FIELDS=Object.freeze({
 background:'color',textColor:'color',headingColor:'color',borderColor:'color',
 buttonBackground:'color',buttonText:'color',buttonBorder:'color',linkColor:'color',
 fontFamily:'font',fontSize:'fontSize',fontWeight:'weight',textAlign:'align',
 padding:'space',gap:'space',radius:'radius',borderWidth:'borderWidth',
 shadow:'shadow',maxWidth:'maxWidth',minHeight:'minHeight',
 buttonRadius:'radius',buttonFontSize:'fontSize',minColumnWidth:'columnWidth',
 columns:'columns'
});
export const DESIGN_PAGE_THEMES=Object.freeze(['both','light','dark']);
const FONTS=['inter','system','arial','verdana','tahoma','trebuchet','georgia','times','courier'];
const FONT_WEIGHTS=[400,500,600,700];
const ALIGNS=['left','center','right'];
const SHADOWS=['none','subtle','medium','strong'];
const COLUMNS=['auto','1','2','3','4'];
const HEX=/^#[a-fA-F0-9]{6}$/;
const SLOT=/^(?:page|block:(?:0|[1-9][0-9]?)|id:[A-Za-z][A-Za-z0-9_-]{0,63})$/;
const LIMIT=120;
const error=(message,status=400)=>Object.assign(Error(message),{status});
export function validDesignPageKey(key){
 return typeof key==='string'&&KEYS.has(key);
}
export function validDesignSlot(slot){
 return typeof slot==='string'&&slot.length<=72&&SLOT.test(slot)&&
  (!slot.startsWith('block:')||Number(slot.slice(6))<LIMIT);
}
export function validateDesignPageStyle(style){
 if(!style||typeof style!=='object'||Array.isArray(style)||
  Object.keys(style).length>Object.keys(DESIGN_PAGE_FIELDS).length)
  throw error('Ongeldige vormgevingswaarden');
 const result={};
 for(const [name,value] of Object.entries(style)){
  const type=DESIGN_PAGE_FIELDS[name];
  if(!type)throw error('Onbekende opmaakinstelling');
  const valid=type==='color'?typeof value==='string'&&HEX.test(value):
    type==='font'?FONTS.includes(value):
    type==='weight'?FONT_WEIGHTS.includes(value):
    type==='align'?ALIGNS.includes(value):
    type==='shadow'?SHADOWS.includes(value):
    type==='columns'?COLUMNS.includes(value):
    Number.isSafeInteger(value)&&({
     fontSize:value>=10&&value<=26,
     space:value>=0&&value<=48,
     radius:value>=0&&value<=40,
     borderWidth:value>=0&&value<=5,
     maxWidth:value===0||(value>=280&&value<=1800),
     minHeight:value>=0&&value<=720,
     columnWidth:value>=160&&value<=500
    }[type]===true);
  if(!valid)throw error('Ongeldige instelling: '+name);
  result[name]=value;
 }
 return result;
}
export function validatedDesignPageWrite(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).some(key=>!['slot','theme','style','reason','expectedRevision'].includes(key))||
  !['slot','theme','style','reason','expectedRevision'].every(k=>Object.hasOwn(raw,k)))
  throw error('Ongeldige wijziging van paginaopmaak');
 if(!validDesignSlot(raw.slot)||!DESIGN_PAGE_THEMES.includes(raw.theme))
  throw error('Kies een geldige pagina, kader en thema');
 if(!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)
  throw error('De pagina-instellingen zijn gewijzigd; laad opnieuw',409);
 const reason=typeof raw.reason==='string'?raw.reason.trim():'';
 if(reason.length<10||reason.length>240||/[\x00-\x1f\x7f<>]/.test(reason))
  throw error('Vul een motivering van 10 tot 240 tekens in');
 return {slot:raw.slot,theme:raw.theme,style:validateDesignPageStyle(raw.style),
  reason,expectedRevision:raw.expectedRevision};
}
export function pageDesignSlotKey(slot,theme){return theme+'|'+slot}
export function pageDesignStylesFrom(raw){
 const out={};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
 for(const [key,value] of Object.entries(raw).slice(0,LIMIT)){
  const bar=key.indexOf('|');
  if(bar<0)continue;
  const theme=key.slice(0,bar),slot=key.slice(bar+1);
  if(!DESIGN_PAGE_THEMES.includes(theme)||!validDesignSlot(slot))continue;
  try{out[key]=validateDesignPageStyle(value)}catch{}
 }
 return out;
}
