import {DIRECTORY_DEPTS,directoryStatusKind,activeDirectorySpecialties,
 filterCompactDirectory,directorySeriesOptions} from './personnel-compact-policy.js';
const el=(tag,cls='',text)=>{
 const result=document.createElement(tag);
 if(cls)result.className=cls;
 if(text!==undefined)result.textContent=String(text);
 return result;
};
const choice=(value,label)=>{const opt=el('option','',label);opt.value=value;return opt};
const STATUS=[['all','Alle statussen'],['active','Actief'],['leave','Verlof'],
 ['inactive','Inactief'],['warning','Opvolging'],['muted','Afgesloten'],
 ['neutral','Overig']];
const SELECTED_SPECIALTIES=3;
const safeRankArt=src=>typeof src==='string'&&(
 src.startsWith('/')||/^https:\/\/[a-z0-9.-]+\//i.test(src));
function rankBadge(person){
 const wrap=el('span','pc-rank');
 if(person.hasPoliceEntry===false){wrap.textContent='—';return wrap}
 const info=window.BPDPersonnelVisuals?.rankInfo?.(person.rank,'politie');
 if(safeRankArt(info?.image)){
  const img=el('img');img.src=info.image;img.alt='';img.loading='lazy';
  img.addEventListener('error',()=>img.remove(),{once:true});
  wrap.append(img);
 }
 wrap.append(el('strong','',info?.code||String(person.rank||'—').slice(0,8)));
 wrap.title=info?.label||person.rank||'';return wrap;
}
function specialtyList(person){
 const labels=activeDirectorySpecialties(person);
 const wrapper=el('span','pc-specialties');
 if(!labels.length){wrapper.append(el('span','pc-empty','—'));return wrapper}
 for(const label of labels.slice(0,SELECTED_SPECIALTIES))
  wrapper.append(el('span','pc-specialty',label));
 if(labels.length>SELECTED_SPECIALTIES)
  wrapper.append(el('span','pc-specialty-more','+'+(labels.length-SELECTED_SPECIALTIES)));
 wrapper.title=labels.join(' · ');return wrapper;
}
function rowFor(person,openPerson){
 const clickable=person.hasPoliceEntry!==false&&/^[a-z0-9 *_-]{1,24}$/i.test(
  String(person.call||''));
 const row=el(clickable?'button':'div','pc-entry');
 if(clickable){
  row.type='button';row.classList.add('pc-clickable');
  row.setAttribute('aria-label','Open personeelskaart van '+person.name);
  row.addEventListener('click',()=>openPerson(String(person.call),String(person.name)));
 }else row.title='Nog geen politiepersoneelskaart beschikbaar';
 row.append(el('span','pc-call',person.call||'—'));
 row.append(rankBadge(person));
 const identity=el('span','pc-identity');
 identity.append(el('strong','',person.name));
 if((person.services||[]).length>1||person.hasPoliceEntry===false)
  identity.append(el('small','',Array.isArray(person.services)?
   person.services.join(' · '):''));
 row.append(identity);
 const series=el('span','pc-series',person.series&&person.series!=='—'?person.series:'—');
 const match=/([1-4])/.exec(String(person.series||''));
 if(match)series.classList.add('pc-series-'+match[1]);
 row.append(series);
 const status=el('span','pc-status pc-status-'+directoryStatusKind(person.status),
  String(person.status||'Onbekend').slice(0,28));
 row.append(status,specialtyList(person));
 if(clickable)row.append(el('span','pc-chevron','›'));
 return row;
}
export function mountCompactPersonnelDirectory({root,fetchPersonnel,viewerUid,openPerson}){
 const toolbar=el('div','pc-toolbar');
 const searchLabel=el('label','pc-field');
 searchLabel.append(el('span','', 'Zoeken'));
 const search=el('input');search.type='search';
 search.placeholder='Naam, CALL, rang of specialisatie';search.autocomplete='off';
 searchLabel.append(search);
 const departmentLabel=el('label','pc-field');
 departmentLabel.append(el('span','', 'Hulpdienst'));
 const department=el('select');
 for(const item of DIRECTORY_DEPTS)department.append(choice(item.key,item.label));
 departmentLabel.append(department);
 const seriesLabel=el('label','pc-field');
 seriesLabel.append(el('span','', 'Reeks'));
 const series=el('select');series.append(choice('all','Alle reeksen'));seriesLabel.append(series);
 const statusLabel=el('label','pc-field');
 statusLabel.append(el('span','', 'Status'));
 const status=el('select');
 for(const item of STATUS)status.append(choice(item[0],item[1]));
 statusLabel.append(status);
 const reload=el('button','pc-reload','Vernieuwen');reload.type='button';
 toolbar.append(searchLabel,departmentLabel,seriesLabel,statusLabel,reload);
 const meta=el('div','pc-meta');
 const count=el('span','pc-count','Personeelslijst laden…');
 const legend=el('span','pc-legend','Selecteer een naam om de personeelskaart rechts te bekijken.');
 meta.append(count,legend);
 const table=el('div','pc-table');
 table.setAttribute('role','table');
 const heading=el('div','pc-heading');
 heading.setAttribute('role','row');
 for(const value of ['CALL','RANG','PERSONEELSLID','REEKS','STATUS','SPECIALISATIES',''])
  heading.append(el('span','',value));
 table.append(heading);
 const results=el('div','pc-results');
 results.setAttribute('role','rowgroup');
 table.append(results);
 const legacy=el('details','pc-legacy');
 const summary=el('summary','', 'Volledige tabel met alle specialisatiekolommen');
 legacy.append(summary);
 const note=el('p','pc-note','De uitgebreide, bestaande personeelslijst blijft hier beschikbaar. Op smalle schermen kunnen de detailkolommen horizontaal scrollen.');
 const frame=el('iframe');frame.id='personnelDirectoryFrame';
 frame.title='Uitgebreide personeelslijst (alle specialisatiekolommen)';
 frame.loading='lazy';frame.referrerPolicy='same-origin';
 legacy.append(note,frame);
 legacy.addEventListener('toggle',()=>{
  if(legacy.open&&!frame.hasAttribute('src'))
   frame.src='/personeelslijst.html?embed=1';
 });
 root.append(toolbar,meta,table,legacy);
 let records=null,owner='',loadedAt=0,stale=false,busy=null,querySerial=0;
 let idResults=null,idQuery='';
 function draw(){
  const q=search.value.trim(),byId=/^\d{15,22}$/.test(q);
  const data=byId?(idQuery===q?idResults||[]:[]):records||[];
  const filtered=filterCompactDirectory(data,{
   query:byId?'':q,department:department.value,series:series.value,status:status.value
  });
  results.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const person of filtered.slice(0,1200))fragment.append(rowFor(person,openPerson));
  if(!filtered.length)fragment.append(el('p','pc-empty-state',
   byId&&idQuery!==q?'Discord-ID veilig opzoeken…':
   'Geen personeelsleden gevonden met deze filters.'));
  results.append(fragment);
  count.textContent=(!records?'Personeelslijst laden…':
   filtered.length+' van '+records.length+' personeelsleden zichtbaar')+
   (stale?' · Brongegevens tijdelijk verouderd':'');
 }
 function seriesOptions(){
  const current=series.value;
  series.replaceChildren(choice('all','Alle reeksen'));
  for(const value of directorySeriesOptions(records))series.append(choice(value,value));
  if([...series.options].some(x=>x.value===current))series.value=current;
 }
 async function refresh(force=false){
  const uid=viewerUid();
  if(!uid){owner='';records=null;draw();count.textContent='Meld je aan om de personeelslijst te bekijken.';return}
  if(!force&&records&&owner===uid&&Date.now()-loadedAt<60000){draw();return}
  if(busy){await busy;draw();return}
  owner=uid;reload.disabled=true;count.textContent='Actuele personeelslijst laden…';
  busy=(async()=>{
   try{
    const response=await fetchPersonnel();
    if(viewerUid()!==uid)return;
    if(!Array.isArray(response?.records)||response.readOnly!==true)
     throw Error('De personeelsbron gaf geen geldige gegevens terug');
    records=response.records;
    stale=response.stale===true;loadedAt=Date.now();
    seriesOptions();
   }catch(e){
    if(viewerUid()===uid)count.textContent='Personeelslijst tijdelijk niet beschikbaar: '+e.message;
    records=null;
   }
  })();
  try{await busy}finally{busy=null;reload.disabled=false}
  if(records)draw();
 }
 async function lookupId(){
  const text=search.value.trim(),serial=++querySerial,uid=viewerUid();
  idResults=null;idQuery='';draw();
  if(!/^\d{15,22}$/.test(text))return;
  try{
   const response=await fetchPersonnel(text);
   if(serial!==querySerial||viewerUid()!==uid||search.value.trim()!==text)return;
   idResults=Array.isArray(response?.records)?response.records:[];
   idQuery=text;draw();
  }catch(e){if(serial===querySerial){idQuery=text;idResults=[];draw();
   count.textContent='Discord-ID zoeken niet beschikbaar: '+e.message}}
 }
 let idTimer=0;
 search.addEventListener('input',()=>{
  window.clearTimeout(idTimer);
  if(/^\d{15,22}$/.test(search.value.trim()))
   idTimer=window.setTimeout(()=>void lookupId(),350);
  else{querySerial++;idQuery='';idResults=null;draw()}
 });
 for(const input of [department,series,status])input.addEventListener('change',draw);
 reload.addEventListener('click',()=>void refresh(true));
 return {activate:refresh,refresh:()=>refresh(true),
  reset(){owner='';records=null;loadedAt=0;idResults=null;idQuery='';
   querySerial++;frame.removeAttribute('src');legacy.open=false;draw()}};
}
