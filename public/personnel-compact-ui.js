import {DIRECTORY_DEPTS,directoryStatusKind,activeDirectorySpecialties,
 filterCompactDirectory,directorySeriesOptions,scopedServiceDirectory} from './personnel-compact-policy.js';
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
const SELECTED_SPECIALTIES=4;
const safeRankArt=src=>typeof src==='string'&&(
 src.startsWith('/')||/^https:\/\/[a-z0-9.-]+\//i.test(src));
function rankBadge(person){
 const wrap=el('span','pc-rank');
 if(person.hasPoliceEntry===false){
  wrap.append(el('strong','',person.serviceDept?String(person.rank||'—'):'—'));
  wrap.title=person.rank||'';
  return wrap;
 }
 const info=window.BPDPersonnelVisuals?.rankInfo?.(person.rank,'politie');
 if(safeRankArt(info?.image)){
  const img=el('img');img.src=info.image;img.alt='';img.loading='lazy';
  img.addEventListener('error',()=>img.remove(),{once:true});
  wrap.append(img);
 }
 wrap.append(el('strong','',info?.code||String(person.rank||'—').slice(0,8)));
 wrap.title=info?.label||person.rank||'';return wrap;
}
function specialtyList(person,showAll=false){
 const labels=activeDirectorySpecialties(person);
 const wrapper=el('span','pc-specialties');
 if(!labels.length){wrapper.append(el('span','pc-empty','—'));return wrapper}
 for(const label of (showAll?labels:labels.slice(0,SELECTED_SPECIALTIES)))
  wrapper.append(el('span','pc-specialty',label));
 if(!showAll&&labels.length>SELECTED_SPECIALTIES)
  wrapper.append(el('span','pc-specialty-more','+'+(labels.length-SELECTED_SPECIALTIES)));
 wrapper.title=labels.join(' · ');return wrapper;
}
function rowFor(person,openPerson,showAll){
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
 if(person.serviceDept||(person.services||[]).length>1||person.hasPoliceEntry===false)
  identity.append(el('small','',Array.isArray(person.services)?
   person.services.join(' · '):''));
 row.append(identity);
 const series=el('span','pc-series',person.series&&person.series!=='—'?person.series:'—');
 const match=/([1-4])/.exec(String(person.series||''));
 if(match)series.classList.add('pc-series-'+match[1]);
 row.append(series);
 const status=el('span','pc-status pc-status-'+directoryStatusKind(person.status),
  String(person.status||'Onbekend').slice(0,28));
 row.append(status,specialtyList(person,showAll));
 if(clickable)row.append(el('span','pc-chevron','›'));
 return row;
}
export function mountCompactPersonnelDirectory({root,fetchPersonnel,viewerUid,openPerson}){
 const toolbar=el('div','pc-toolbar');
 const scopeLabel=el('label','pc-field pc-scope-field');
 scopeLabel.hidden=true;
 scopeLabel.append(el('span','','Bekijken'));
 const scope=el('select');
 scope.append(choice('all','Algemene personeelslijst'),
  choice('service','Personeel van mijn dienst'));
 scopeLabel.append(scope);
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
 // Only verified kader accounts receive the police series selector.
 seriesLabel.hidden=true;
 seriesLabel.append(el('span','', 'Reeks'));
 const series=el('select');series.append(choice('all','Alle reeksen'));seriesLabel.append(series);
 const statusLabel=el('label','pc-field');
 statusLabel.append(el('span','', 'Status'));
 const status=el('select');
 for(const item of STATUS)status.append(choice(item[0],item[1]));
 statusLabel.append(status);
 const reload=el('button','pc-reload','Vernieuwen');reload.type='button';
 toolbar.append(searchLabel,scopeLabel,departmentLabel,seriesLabel,statusLabel,reload);
 const meta=el('div','pc-meta');
 const count=el('span','pc-count','Personeelslijst laden…');
 const legend=el('span','pc-legend','Bekijken staat los van beheren: wijzigingen gebeuren uitsluitend via Beheer.');
 const showAll=el('button','pc-show-all','Alle specialisaties tonen');
 showAll.type='button';
 showAll.setAttribute('aria-pressed','false');
 meta.append(count,legend,showAll);
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
 const frame=el('iframe');frame.id='personnelLegacyDirectoryFrame';
 frame.title='Uitgebreide personeelslijst (alle specialisatiekolommen)';
 frame.loading='lazy';frame.referrerPolicy='same-origin';
 legacy.append(note,frame);
 legacy.addEventListener('toggle',()=>{
  if(legacy.open&&!frame.hasAttribute('src'))
   frame.src='/personeelslijst.html?embed=1';
 });
 root.append(toolbar,meta,table,legacy);
 let records=null,owner='',loadedAt=0,stale=false,busy=null,querySerial=0;
 let idResults=null,idQuery='',scopedRecords=[],allowedDepts=[],showAllBadges=false;
 const serviceLabels={politie:'Politie',brandweer:'Brandweer',ambulance:'Ambulance',
  depannage:'Depannage',burger:'Burger'};
 function activeRecords(){return scope.value==='service'?scopedRecords:records||[]}
 function updateScope(){
  const canSee=allowedDepts.length>0;
  scopeLabel.hidden=!canSee;
  if(!canSee||scope.value==='service'&&!scopedRecords.length)scope.value='all';
  const current=department.value;
  department.replaceChildren(choice('all',scope.value==='service'?
   'Mijn toegelaten diensten':'Alle diensten'));
  const keys=scope.value==='service'?
   allowedDepts.map(x=>serviceLabels[x]).filter(Boolean):
   DIRECTORY_DEPTS.filter(x=>x.key!=='all').map(x=>x.key);
  for(const key of keys)department.append(choice(key,key));
  if([...department.options].some(x=>x.value===current))department.value=current;
  seriesLabel.hidden=!allowedDepts.includes('politie');
  seriesOptions();draw();
 }
 function draw(){
  const q=search.value.trim(),byId=/^\d{15,22}$/.test(q);
  const data=byId?(scope.value==='all'&&idQuery===q?idResults||[]:[]):activeRecords();
  const filtered=filterCompactDirectory(data,{
   query:byId?'':q,department:department.value,series:series.value,status:status.value
  });
  results.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const person of filtered.slice(0,1200))fragment.append(rowFor(person,openPerson,showAllBadges));
  if(!filtered.length)fragment.append(el('p','pc-empty-state',
   byId&&scope.value==='service'?'Zoeken op Discord-ID kan via de algemene personeelslijst.':
   byId&&idQuery!==q?'Discord-ID veilig opzoeken…':
   'Geen personeelsleden gevonden met deze filters.'));
  results.append(fragment);
  count.textContent=(!records?'Personeelslijst laden…':
   filtered.length+' van '+activeRecords().length+' personeelsleden zichtbaar')+
   (scope.value==='service'?' · Geverifieerde dienstinzage':'')+
   (stale?' · Brongegevens tijdelijk verouderd':'');
 }
 function seriesOptions(){
  const current=series.value;
  series.replaceChildren(choice('all','Alle reeksen'));
  for(const value of directorySeriesOptions(activeRecords()))series.append(choice(value,'Reeks '+value));
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
    seriesOptions();updateScope();
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
  if(scope.value==='all'&&/^\d{15,22}$/.test(search.value.trim()))
   idTimer=window.setTimeout(()=>void lookupId(),350);
  else{querySerial++;idQuery='';idResults=null;draw()}
 });
 scope.addEventListener('change',updateScope);
 showAll.addEventListener('click',()=>{
  showAllBadges=!showAllBadges;
  showAll.setAttribute('aria-pressed',String(showAllBadges));
  showAll.textContent=showAllBadges?'Minder specialisaties tonen':'Alle specialisaties tonen';
  draw();
 });
 for(const input of [department,series,status])input.addEventListener('change',draw);
 reload.addEventListener('click',()=>void refresh(true));
 return {activate:refresh,refresh:()=>refresh(true),
  // Pass only records returned by an independently authorized manager API.
  setScopedPersonnel(rows,departments){
   const safe=(Array.isArray(departments)?departments:[])
    .filter(d=>Object.hasOwn(serviceLabels,d));
   allowedDepts=[...new Set(safe)];
   scopedRecords=scopedServiceDirectory(rows,allowedDepts);
   updateScope();
  },
  reset(){owner='';records=null;loadedAt=0;idResults=null;idQuery='';
   allowedDepts=[];scopedRecords=[];scope.value='all';showAllBadges=false;
   showAll.textContent='Alle specialisaties tonen';
   showAll.setAttribute('aria-pressed','false');
   querySerial++;frame.removeAttribute('src');legacy.open=false;updateScope()}};
}
