import {defaultGroupSettings,GROUP_DEPARTMENTS,GROUP_TIER_DEFAULTS} from './personnel-group-settings-policy.js';
const NAMES={politie:'Politie',brandweer:'Brandweer',ambulance:'Ambulance',
 depannage:'Depannage',burger:'Burger'};
const node=(tag,text='',cls='')=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(text)el.textContent=text;return el;
};
const field=(label,value,change,limit=72)=>{
 const wrap=node('label','','personnel-settings-field');
 wrap.append(node('span',label));
 const el=node('input');el.type='text';el.maxLength=limit;el.value=value;
 el.addEventListener('input',()=>change(el.value));
 wrap.append(el);return wrap;
};
function clone(value){return JSON.parse(JSON.stringify(value))}
export function mountPersonnelGroupSettingsEditor({root,request,onSaved}){
 let configs={},rights={},selected='politie',draft=null,loading=false;
 const header=node('div','','personnel-settings-top');
 const title=node('h2','Indeling van reeksen en specialisaties');
 const service=node('select');
 service.setAttribute('aria-label','Kies hulpdienst');
 for(const dept of GROUP_DEPARTMENTS){
  const option=node('option',NAMES[dept]);option.value=dept;service.append(option);
 }
 header.append(title,service);
 const intro=node('p',
  'Wijzig alleen de weergave. Leden, rang, Discord-rollen, specialisatiebevoegdheden en dossiers blijven ongewijzigd.',
  'personnel-settings-help');
 const status=node('p','Instellingen laden…','personnel-settings-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const heading=node('h3','Reeksen');
 const series=node('div','','personnel-settings-entries');
 const specialtyTitle=node('h3','Specialisaties');
 const specialties=node('div','','personnel-settings-entries');
 const tiersTitle=node('h3','Benamingen van functies');
 const tierFields=node('div','','personnel-settings-tiers');
 const reason=field('Motivering bij opslaan','',()=>{},300);
 const reasonInput=reason.querySelector('input');
 reasonInput.placeholder='Verplicht: 8–300 tekens';
 const buttons=node('div','','personnel-settings-actions');
 const save=node('button','Instellingen bewaren');
 const reset=node('button','Standaardindeling herstellen');
 const refresh=node('button','Vernieuwen');
 save.type=reset.type=refresh.type='button';reset.className=refresh.className='alt';
 buttons.append(save,reset,refresh);
 const links=node('p','','personnel-settings-links');
 const roleLink=node('a','Rollen en specialisaties koppelen');
 roleLink.href='/rollenbeheer.html';
 const artLink=node('a','Patches beheren');artLink.href='/beeldbibliotheek.html';
 const peopleLink=node('a','Personeelsfiches en reeksen beheren');
 peopleLink.href='/personeelsbeheer.html';
 links.append(roleLink,artLink,peopleLink);
 root.append(header,intro,status,heading,series,specialtyTitle,specialties,
  tiersTitle,tierFields,reason,buttons,links);
 function eligible(){return rights[selected]===true}
 function warn(message,bad=false){
  status.textContent=message;status.style.color=bad?'#ffb9c2':'#bed8ee';
 }
 function rows(target,kind,items){
  target.replaceChildren();
  if(!items.length){
   target.append(node('p',kind==='series'?'Deze hulpdienst heeft geen politiereeksen.':
    'Nog geen geregistreerde specialisaties. Voeg deze toe via Rollenbeheer.',
    'personnel-settings-help'));return
  }
  items.forEach((entry,index)=>{
   const row=node('div','','personnel-settings-entry');
   row.append(node('code',entry.key));
   row.append(field('Naam',entry.label,value=>{entry.label=value}));
   if(kind==='specialties')row.append(field('Pictogram',entry.icon||'',
    value=>{entry.icon=value},12));
   const check=node('label','', 'personnel-settings-toggle');
   const box=node('input');box.type='checkbox';box.checked=!entry.hidden;
   box.addEventListener('change',()=>{entry.hidden=!box.checked});
   check.append(box,node('span','Zichtbaar'));row.append(check);
   const up=node('button','↑'),down=node('button','↓');
   up.type=down.type='button';up.title='Omhoog';down.title='Omlaag';
   up.setAttribute('aria-label','Verplaats '+entry.key+' omhoog');
   down.setAttribute('aria-label','Verplaats '+entry.key+' omlaag');
   up.disabled=index===0;down.disabled=index===items.length-1;
   up.addEventListener('click',()=>{
    [items[index-1],items[index]]=[items[index],items[index-1]];renderDraft();
   });
   down.addEventListener('click',()=>{
    [items[index+1],items[index]]=[items[index],items[index+1]];renderDraft();
   });
   row.append(up,down);target.append(row);
  });
 }
 function renderDraft(){
  service.value=selected;
  const allowed=eligible();
  save.disabled=!allowed||!draft;reset.disabled=!allowed||!draft;
  reasonInput.disabled=!allowed;
  heading.hidden=selected!=='politie';series.hidden=selected!=='politie';
  if(!draft){series.replaceChildren();specialties.replaceChildren();
   tierFields.replaceChildren();return}
  rows(series,'series',draft.series);
  rows(specialties,'specialties',draft.specialties);
  tierFields.replaceChildren();
  for(const [key,defaultLabel] of Object.entries(GROUP_TIER_DEFAULTS))
   tierFields.append(field(defaultLabel,draft.tiers[key],value=>{draft.tiers[key]=value}));
  for(const elem of [...series.querySelectorAll('input,button'),
   ...specialties.querySelectorAll('input,button'),
   ...tierFields.querySelectorAll('input')])elem.disabled=!allowed||elem.disabled;
  warn(allowed?
   'Instellingen voor '+NAMES[selected]+'. Wijzigingen zijn pas zichtbaar na bewaren.':
   'Je kunt deze indeling bekijken, maar niet wijzigen zonder bevoegde dienstrechten.');
 }
 function selectDept(dept){
  if(!GROUP_DEPARTMENTS.includes(dept))return;
  selected=dept;
  draft=clone(configs[dept]||defaultGroupSettings(dept));
  reasonInput.value='';renderDraft();
 }
 service.addEventListener('change',()=>selectDept(service.value));
 async function load(){
  if(loading)return;
  loading=true;warn('Beheerinstellingen laden…');
  try{
   const response=await request('/api/personnel-group-settings');
   // READ is available to all approved portal users. Editable service scopes
   // require a separate verified dossier session; 403 means read-only.
   const scoped=await request('/api/personnel-group-settings/edit-permissions')
    .catch(()=>({canEdit:{}}));
   configs=response.settings||{};
   rights={...(response.canEdit||{}),...(scoped.canEdit||{})};
   selectDept(selected);
  }catch(e){warn('Laden mislukt: '+e.message,true)}
  finally{loading=false}
 }
 async function submit(){
  if(!draft||!eligible())return;
  const motivation=reasonInput.value.trim();
  if(motivation.length<8||motivation.length>300)
   return warn('Motivering van 8 tot 300 tekens is verplicht.',true);
  save.disabled=true;
  try{
   const saved=await request('/api/personnel-group-settings/'+selected,{
    method:'PUT',body:{expectedRevision:draft.revision,series:draft.series,
     specialties:draft.specialties,tiers:draft.tiers,reason:motivation}
   });
   configs[selected]=saved.settings;
   draft=clone(saved.settings);
   reasonInput.value='';
   renderDraft();warn('Opgeslagen in Firebase en vastgelegd in het wijzigingslogboek.');
   await onSaved();
  }catch(e){
   warn('Opslaan mislukt: '+e.message,true);
   if(/gewijzigd|Vernieuw/.test(String(e.message)))await load();
  }finally{save.disabled=!eligible()}
 }
 save.addEventListener('click',()=>void submit());
 reset.addEventListener('click',()=>{
  if(!eligible()||!draft)return;
  if(!confirm('De zichtbare indeling van '+NAMES[selected]+
    ' naar standaardnamen en -volgorde terugzetten? Er worden geen leden of rollen gewijzigd.'))return;
  const registered=draft.specialties.map(x=>x.key);
  const defaults=defaultGroupSettings(selected,registered);
  draft={...defaults,revision:draft.revision};
  renderDraft();
  warn('Standaardwaarden staan klaar. Vul een motivering in en klik op Instellingen bewaren.');
 });
 refresh.addEventListener('click',()=>void load());
 return {activate:load,reset:()=>{
  configs={};rights={};draft=null;series.replaceChildren();
  specialties.replaceChildren();tierFields.replaceChildren();reasonInput.value='';
  warn('Meld je opnieuw aan om deze instellingen te bekijken.');
 }};
}
