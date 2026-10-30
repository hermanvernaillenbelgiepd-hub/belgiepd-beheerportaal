// Quick visual setup: choose one base coat per group and independent badges
// per actual police call series, fire rank or ambulance qualification.
// This editor only calls existing audited visual APIs; no personnel edits.
import {POLICE_UNIFORM_GROUPS,POLICE_CALL_GRADES,AMBULANCE_FUNCTIONS,normalizeVisual}
 from '/uniform-profile-policy.js';
import {getTier} from '/assets/organogram-hierarchie-model.js';

export function setupUniformQuickUI({api,$}){
 const section=$('uniformQuickSection'),dept=$('uniformQuickDept'),
  coats=$('uniformQuickCoats'),marks=$('uniformQuickMarks'),
  reason=$('uniformQuickReason'),status=$('uniformQuickStatus');
 const services=[['politie','Politie'],['brandweer','Brandweer'],['ambulance','Ambulance'],
  ['depannage','Depannage'],['burger','Burger']];
 let artwork=[],uniformAssignments=[],markRules=[],people=[],editable=[];
 const message=(s,bad=false)=>{status.textContent=s;status.classList.toggle('error',bad)};
 const option=(value,label)=>new Option(label,value);
 const titles={rank:'Gradenplaat',helmet:'Helm',profession:'Beroepsteken'};
 const groupLabel=r=>r.scope==='group'?POLICE_UNIFORM_GROUPS.find(x=>x.code===r.selector)?.label||r.selector:
  r.scope==='function'?AMBULANCE_FUNCTIONS.find(x=>x[0]===r.selector)?.[1]||r.selector:
  r.scope==='service'?'Alle personeelsleden':r.scope==='rank'?r.selector.replace(/_/g,' '):
  r.scope==='cadre'?r.selector.replace(/_/g,' '):r.selector;
 function getUniformTargets(){
  if(dept.value==='politie')return [
   {scope:'service',selector:'default',label:'Algemeen standaarduniform (terugval)'},
   ...POLICE_UNIFORM_GROUPS.map(x=>({scope:'group',selector:x.code,label:x.label}))
  ];
  if(dept.value==='ambulance')return [
   {scope:'service',selector:'default',label:'Basisjas voor alle functies'},
   ...AMBULANCE_FUNCTIONS.map(([selector,label])=>({scope:'function',selector,label}))
  ];
  const current=people.filter(x=>x.dept===dept.value);
  const cadres=[...new Map(current.map(p=>[normalizeVisual(getTier(p)),getTier(p)])
   .filter(([id])=>id)).entries()];
  return [
   {scope:'service',selector:'default',label:'Standaarduniform voor de dienst'},
   ...cadres.map(([selector,label])=>({scope:'cadre',selector,label}))
  ];
 }
 function getMarkTargets(){
  if(dept.value==='politie')return POLICE_CALL_GRADES.map(([selector,label])=>({
   scope:'call',selector,label:selector+' — '+label,kinds:['rank']
  }));
  if(dept.value==='ambulance')return AMBULANCE_FUNCTIONS.map(([selector,label])=>({
   scope:'function',selector,label,kinds:['profession']
  }));
  if(dept.value==='brandweer'){
   const ranks=[...new Map(people.filter(x=>x.dept==='brandweer'&&x.rank)
    .map(p=>[normalizeVisual(p.rank),p.rank])).entries()];
   return ranks.sort((a,b)=>a[1].localeCompare(b[1],'nl')).map(([selector,label])=>({
    scope:'rank',selector,label,kinds:['rank','helmet']
   }));
  }
  return [];
 }
 function candidates(kind){
  return artwork.filter(x=>x.department===dept.value&&x.kind===kind&&x.active!==false)
   .sort((a,b)=>String(a.label).localeCompare(String(b.label),'nl'));
 }
 function makeSelect(kind,selected,aria){
  const select=document.createElement('select');
  select.setAttribute('aria-label',aria);
  select.append(option('','Automatisch / standaard'));
  for(const a of candidates(kind))select.append(option(a.code,a.label+' ('+a.code+')'));
  select.value=[...select.options].some(o=>o.value===selected)?selected:'';
  return select;
 }
 function openUploader(kind,target,label){
  const tab=document.querySelector('#manageTabs button[data-tab="artwork"]');
  if(tab)tab.click();
  const dep=$('libraryDept'),type=$('libraryKind'),
   code=$('libraryCode'),name=$('libraryLabel');
  if(dep){dep.value=dept.value;dep.dispatchEvent(new Event('change'));}
  if(type){type.value=kind;type.dispatchEvent(new Event('change'));}
  if(code)code.value=target.selector==='default'?'default':target.selector;
  if(name)name.value=label.slice(0,75);
  const panel=$('libraryPanel');
  if(panel&&!panel.hidden)panel.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function makeRow(label,kind,target,selected,handler){
  const line=document.createElement('div');line.className='uniform-quick-row';
  const title=document.createElement('span');title.className='uniform-quick-row-label';title.textContent=label;
  const select=makeSelect(kind,selected,label+' — '+(titles[kind]||'Uniform'));
  const thumb=document.createElement('img');thumb.className='uniform-quick-preview';
  thumb.alt='Voorbeeld van '+label;thumb.hidden=true;
  const updatePreview=()=>{
   const match=candidates(kind).find(x=>x.code===select.value);
   if(!match){thumb.hidden=true;thumb.removeAttribute('src');return;}
   thumb.src=match.imageUrl;thumb.hidden=false;
  };
  select.addEventListener('change',updatePreview);updatePreview();
  const buttons=document.createElement('span');buttons.className='uniform-quick-actions';
  const upload=document.createElement('button');upload.type='button';upload.className='alt';
  upload.textContent='Upload';upload.title='Upload een nieuwe afbeelding voor '+label;
  upload.onclick=()=>openUploader(kind,target,label);
  const save=document.createElement('button');save.type='button';save.textContent='Bewaren';save.className='alt';
  save.onclick=async()=>{
   if(reason.value.trim().length<8){message('Vul eerst een motivering van minstens acht tekens in.',true);return;}
   save.disabled=true;
   try{
    await handler(select.value,target);
    await reload(true);
    message('Instelling voor '+label+' opgeslagen. De personeelsrechten veranderen niet.');
   }catch(e){message('Bewaren mislukt: '+e.message,true)}
   finally{save.disabled=false;}
  };
  buttons.append(upload,save);line.append(title,select,thumb,buttons);return line;
 }
 function makeUploadLink(){
  const b=document.createElement('button');b.type='button';b.className='alt';
  b.textContent='Afbeeldingen uploaden in de bibliotheek';
  b.onclick=()=>{
   const tab=document.querySelector('#manageTabs button[data-tab="artwork"]');
   if(tab)tab.click();
   const panel=$('libraryPanel');
   if(panel&&!panel.hidden)panel.scrollIntoView({behavior:'smooth',block:'start'});
  };
  return b;
 }
 function makeHeading(container,title,description){
  const head=document.createElement('h4');head.textContent=title;container.append(head);
  const info=document.createElement('p');info.className='muted';info.textContent=description;container.append(info);
 }
 function render(){
  coats.replaceChildren();marks.replaceChildren();
  if(!editable.includes(dept.value)){
   message('Geen uniformbeheerrechten voor deze hulpdienst.',true);return;
  }
  makeHeading(coats,'1 · Basisuniform kiezen',
   'Een jas wordt gekozen voor een volledige groep. De graadtekens blijven aparte afbeeldingen.');
  for(const t of getUniformTargets()){
   const current=uniformAssignments.find(r=>r.department===dept.value&&r.scope===t.scope&&r.selector===t.selector);
   coats.append(makeRow(t.label,'uniform',t,current?.uniformCode||'',async(code,target)=>{
    const currentRule=uniformAssignments.find(r=>r.department===dept.value&&r.scope===target.scope&&r.selector===target.selector);
    const badgeStyle=currentRule?.badgeStyle||'';
    const body={department:dept.value,scope:target.scope,selector:target.selector,
     uniformCode:code,badgeStyle,reason:reason.value.trim()};
    if(!code&&!badgeStyle){
     if(currentRule)await api('/api/uniform-assignments',{method:'DELETE',body});
    }else await api('/api/uniform-assignments',{method:'PUT',body});
   }));
  }
  makeHeading(marks,'2 · Graden en functieaanduidingen kiezen',
   dept.value==='politie'?'Kies per callreeks de gradenplaat, onafhankelijk van het basisuniform.':
   dept.value==='brandweer'?'Kies per brandweergraad de gradenplaat en eventueel de helm.':
   dept.value==='ambulance'?'Kies per hoedanigheid het beroepsteken; het basisuniform blijft gelijk.':
   'Voor deze hulpdienst volstaat doorgaans het basisuniform en het gewone logobeheer.');
  const targets=getMarkTargets();
  if(!targets.length){const p=document.createElement('p');p.className='muted';
   p.textContent=dept.value==='brandweer'?
    'Er zijn nog geen brandweergraden in de personeelsbron gevonden. Je kunt bestaande graden in het uitgebreide beheer blijven instellen.':
    'Geen afzonderlijke gradentekens voor deze categorie.';marks.append(p);}
  for(const t of targets){
   for(const kind of t.kinds){
    const current=markRules.find(r=>r.department===dept.value&&r.kind===kind&&
     r.scope===t.scope&&r.selector===t.selector);
    const label=t.label+(t.kinds.length>1?' · '+titles[kind]:'');
    marks.append(makeRow(label,kind,t,current?.assetCode||'',async(code,target)=>{
     const body={department:dept.value,kind,scope:target.scope,selector:target.selector,
      assetCode:code,reason:reason.value.trim()};
     if(code)await api('/api/uniform-library/rules',{method:'PUT',body});
     else if(current)await api('/api/uniform-library/rules',{method:'DELETE',body});
    }));
   }
  }
  const footer=document.createElement('div');footer.className='controls';
  footer.append(makeUploadLink());marks.append(footer);
 }
 async function reload(keep=false){
  const prev=dept.value;
  const [a,r,u,p,l]=await Promise.all([
   api('/api/role-artwork/manage'),
   api('/api/uniform-library/rules'),
   api('/api/uniform-assignments'),
   api('/api/organogram/hierarchie').catch(()=>({records:[]})),
   api('/api/uniform-library/status')
  ]);
  artwork=a.artworks||[];
  markRules=r.rules||[];
  uniformAssignments=u.assignments||[];
  people=p.records||[];
  editable=(l.editableDepartments||[]).filter(d=>(u.editableDepartments||[]).includes(d));
  dept.replaceChildren();
  for(const [key,label] of services)if(editable.includes(key))dept.append(option(key,label));
  if(keep&&editable.includes(prev))dept.value=prev;
  section.hidden=!editable.length;
  if(!editable.length)return false;
  render();return true;
 }
 const back=$('libraryBackToUniform');
 if(back)back.onclick=()=>{
  const tab=document.querySelector('#manageTabs button[data-tab="uniform"]');
  if(tab)tab.click();
  void reload(true).then(()=>section.scrollIntoView({behavior:'smooth',block:'start'}))
   .catch(e=>message(e.message,true));
 };
 dept.addEventListener('change',render);
 $('uniformQuickRefresh').onclick=()=>reload(true).then(()=>message('Overzicht vernieuwd.'))
  .catch(e=>message(e.message,true));
 return {load:()=>reload(true).catch(e=>{message(e.message,true);return false})};
}
