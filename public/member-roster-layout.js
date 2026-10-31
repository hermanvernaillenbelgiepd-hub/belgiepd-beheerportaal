// Visual-only shared police roster sizing controls. The server decides whether
// the authenticated member is Officierenkader / Korpsleiding. DOM hiding is NOT
// a permission check: all saves are independently authorized by the API.
export const ROSTER_FONT_OPTIONS=Object.freeze({
 inter:'Inter,"Segoe UI",Arial,sans-serif',
 segoe:'"Segoe UI",Arial,sans-serif',
 arial:'Arial,Helvetica,sans-serif',
 verdana:'Verdana,Geneva,sans-serif',
 tahoma:'Tahoma,Arial,sans-serif',
 georgia:'Georgia,serif',
 mono:'Consolas,"Courier New",monospace'
});
export const ROSTER_DEFAULT=Object.freeze({
 fontFamily:'inter',
 rowHeight:28,textSize:11,insigniaWidth:30,tableWidth:1280,
 cellPadding:3,nameColumn:150,rankColumn:165
});
export const ROSTER_PRESETS=Object.freeze({
 compact:Object.freeze({...ROSTER_DEFAULT}),
 standard:Object.freeze({
  fontFamily:'inter',rowHeight:36,textSize:12,insigniaWidth:40,tableWidth:1520,
  cellPadding:5,nameColumn:176,rankColumn:192
 }),
 ruim:Object.freeze({
  fontFamily:'inter',rowHeight:46,textSize:14,insigniaWidth:56,tableWidth:1820,
  cellPadding:8,nameColumn:218,rankColumn:240
 })
});
const controls=Object.freeze({
 rowHeight:{unit:'px',min:26,max:64},
 textSize:{unit:'px',min:9,max:16},
 insigniaWidth:{unit:'px',min:24,max:75},
 tableWidth:{unit:'px',min:1120,max:2500},
 cellPadding:{unit:'px',min:1,max:12},
 nameColumn:{unit:'px',min:115,max:340},
 rankColumn:{unit:'px',min:130,max:340}
});
const cssVars=Object.freeze({
 rowHeight:'--mr-custom-row-height',
 textSize:'--mr-custom-text-size',
 insigniaWidth:'--mr-custom-insignia-width',
 tableWidth:'--mr-custom-table-width',
 cellPadding:'--mr-custom-cell-padding',
 nameColumn:'--mr-custom-name-column',
 rankColumn:'--mr-custom-rank-column'
});
export function parseRosterLayout(value){
 if(!value||typeof value!=='object')return {...ROSTER_DEFAULT};
 const result={};
 for(const [key,config] of Object.entries(controls)){
  const n=value[key];
  result[key]=Number.isSafeInteger(n)&&n>=config.min&&n<=config.max?
   n:ROSTER_DEFAULT[key];
 }
 result.fontFamily=Object.hasOwn(ROSTER_FONT_OPTIONS,value.fontFamily)?
  value.fontFamily:ROSTER_DEFAULT.fontFamily;
 return result;
}
export function rosterPresetName(layout){
 for(const [name,preset] of Object.entries(ROSTER_PRESETS)){
  if(preset.fontFamily===layout.fontFamily&&
    Object.keys(controls).every(key=>preset[key]===layout[key]))return name;
 }
 return 'custom';
}
export function applyRosterLayout(wrapper,layout){
 if(!wrapper)return;
 const safe=parseRosterLayout(layout);
 for(const [key,cssName] of Object.entries(cssVars))
  wrapper.style.setProperty(cssName,String(safe[key])+controls[key].unit);
 wrapper.style.setProperty('--mr-custom-font-family',ROSTER_FONT_OPTIONS[safe.fontFamily]);
}
export function clearRosterLayout(wrapper){
 if(!wrapper)return;
 for(const name of Object.values(cssVars))wrapper.style.removeProperty(name);
 wrapper.style.removeProperty('--mr-custom-font-family');
}
let activeToken=null;
let sessionGeneration=0;
let savedLayout={...ROSTER_DEFAULT};
let authorized=false;
let listening=false;
const byId=id=>document.getElementById(id);
function status(text){const node=byId('rosterLayoutStatus');if(node)node.textContent=text;}
function values(){
 return {...Object.fromEntries(Object.keys(controls).map(key=>
  [key,Number(byId('rosterLayout-'+key).value)])),
  fontFamily:byId('rosterLayout-fontFamily').value};
}
function show(layout){
 const safe=parseRosterLayout(layout);
 for(const key of Object.keys(controls)){
  const field=byId('rosterLayout-'+key);
  const output=byId('rosterLayoutValue-'+key);
  if(field)field.value=String(safe[key]);
  if(output)output.textContent=String(safe[key])+' '+controls[key].unit;
 }
 byId('rosterLayout-fontFamily').value=safe.fontFamily;
 const preset=byId('rosterLayoutPreset');
 if(preset)preset.value=rosterPresetName(safe);
 applyRosterLayout(document.querySelector('.roster-personnel-page .mr-wrapper'),safe);
}
function attachEvents(){
 if(listening)return;
 listening=true;
 const panel=byId('rosterLayoutPanel');
 const toggle=byId('rosterLayoutToggle');
 toggle.addEventListener('click',()=>{
  if(!authorized)return;
  panel.hidden=!panel.hidden;
  toggle.setAttribute('aria-expanded',String(!panel.hidden));
 });
 for(const key of Object.keys(controls)){
  byId('rosterLayout-'+key).addEventListener('input',()=>{
   if(!authorized)return;
   show(values());
   status('Voorbeeld aangepast · nog niet opgeslagen voor alle leden');
  });
 }
 byId('rosterLayout-fontFamily').addEventListener('change',()=>{
  if(!authorized)return;
  show(values());
  status('Lettertype aangepast als voorbeeld · klik op Bewaren voor alle leden');
 });
 byId('rosterLayoutPreset').addEventListener('change',event=>{
  if(!authorized)return;
  const preset=ROSTER_PRESETS[event.target.value];
  if(!preset)return;
  show(preset);
  status('Voorbeeld aangepast · klik op Bewaren om de standaard te wijzigen');
 });
 byId('rosterLayoutReset').addEventListener('click',()=>{
  if(!authorized)return;
  show(ROSTER_DEFAULT);
  status('Oorspronkelijke afmetingen als voorbeeld · klik op Bewaren om te herstellen');
 });
 byId('rosterLayoutCancel').addEventListener('click',()=>{
  if(!authorized)return;
  show(savedLayout);
  status('Opgeslagen afmetingen hersteld in het voorbeeld');
 });
 byId('rosterLayoutSave').addEventListener('click',async()=>{
  if(!authorized||!activeToken)return;
  const layout=values();
  const save=byId('rosterLayoutSave');
  save.disabled=true;
  status('Instellingen opslaan…');
  try{
   const res=await fetch('/api/member/personnel-layout',{
    method:'PUT',headers:{Authorization:'Bearer '+activeToken,
      'Content-Type':'application/json'},
    body:JSON.stringify({layout}),cache:'no-store'
   });
   const data=await res.json();
   if(!res.ok)throw Error(data.error||'Opslaan mislukt');
   if(!authorized)return;
   savedLayout=parseRosterLayout(data.layout);
   show(savedLayout);
   status('Bewaard · deze afmetingen gelden voortaan voor alle leden');
  }catch(error){
   status('Niet opgeslagen: '+error.message);
  }finally{save.disabled=!authorized;}
 });
}
export function logoutRosterLayout(){
 sessionGeneration++;
 authorized=false;activeToken=null;
 const tools=byId('rosterLayoutTools');
 if(tools)tools.hidden=true;
 const panel=byId('rosterLayoutPanel');
 if(panel)panel.hidden=true;
 const toggle=byId('rosterLayoutToggle');
 if(toggle)toggle.setAttribute('aria-expanded','false');
 const save=byId('rosterLayoutSave');
 if(save)save.disabled=true;
 clearRosterLayout(document.querySelector('.roster-personnel-page .mr-wrapper'));
}
export async function loadRosterLayout(token){
 logoutRosterLayout();
 if(typeof token!=='string'||!token)return;
 const generation=sessionGeneration;
 try{
  const response=await fetch('/api/member/personnel-layout',{
   headers:{Authorization:'Bearer '+token},cache:'no-store'
  });
  const data=await response.json();
  // A logout or account switch may have happened while the fetch ran.
  if(generation!==sessionGeneration)return;
  if(!response.ok)throw Error(data.error||'Instellingen niet beschikbaar');
  savedLayout=parseRosterLayout(data.layout);
  show(savedLayout);
  authorized=data.canEdit===true;
  activeToken=authorized?token:null;
  const tools=byId('rosterLayoutTools');
  if(tools)tools.hidden=!authorized;
  const save=byId('rosterLayoutSave');
  if(save)save.disabled=!authorized;
  if(authorized){
   attachEvents();
   status('Standaardafmetingen · alleen Officierenkader en Korpsleiding kunnen bewaren');
  }
 }catch(_error){
  // Fail closed and do not overwrite the UI of a newer session.
  if(generation!==sessionGeneration)return;
  logoutRosterLayout();
 }
}
