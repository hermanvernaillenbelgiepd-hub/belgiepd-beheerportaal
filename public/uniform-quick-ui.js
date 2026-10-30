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
 let artwork=[],uniformAssignments=[],markRules=[],coatGrades=[],people=[],editable=[],cloudReady=false,openCoatCode='';
 const message=(s,bad=false)=>{status.textContent=s;status.classList.toggle('error',bad)};
 const option=(value,label)=>new Option(label,value);
 const titles={rank:'Gradenplaat',helmet:'Helm',profession:'Beroepsteken'};
 const groupLabel=r=>r.scope==='group'?POLICE_UNIFORM_GROUPS.find(x=>x.code===r.selector)?.label||r.selector:
  r.scope==='function'?AMBULANCE_FUNCTIONS.find(x=>x[0]===r.selector)?.[1]||r.selector:
  r.scope==='service'?'Alle personeelsleden':r.scope==='rank'?r.selector.replace(/_/g,' '):
  r.scope==='cadre'?r.selector.replace(/_/g,' '):r.selector;
 function getUniformTargets(){
  if(dept.value==='politie')return [
   {scope:'service',selector:'default',label:'Uniform voor politie (algemeen)'},
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
  return artwork.filter(x=>x.department===dept.value&&x.kind===kind&&x.active!==false&&
   // Old built-in police coat variants are no longer selectable as new coats.
   (kind!=='uniform'||!['silver','gold'].includes(x.code)))
   .sort((a,b)=>String(a.label).localeCompare(String(b.label),'nl'));
 }
 function makeSelect(kind,selected,aria){
  const select=document.createElement('select');
  select.setAttribute('aria-label',aria);
  select.append(option('',kind==='uniform'?'Geen nieuw uniform gekozen':'Automatisch / standaard'));
  for(const a of candidates(kind))select.append(option(a.code,a.label+' ('+a.code+')'));
  select.value=[...select.options].some(o=>o.value===selected)?selected:'';
  return select;
 }
 function openUploader(kind,target,label){
  const tab=document.querySelector('#manageTabs button[data-tab="artwork"]');
  if(tab)tab.click();
  const codeValue=target.selector==='default'?'default':target.selector;
  if(!cloudReady){
   // Original Firebase-backed uploader remains available without a bucket.
   const type=$('roleArtworkKind'),dep=$('roleArtworkDepartment'),
    code=$('roleArtworkCode'),name=$('roleArtworkLabel');
   if(type){type.value=kind;type.dispatchEvent(new Event('change'));}
   if(dep)dep.value=dept.value;
   if(code)code.value=codeValue;
   if(name)name.value=label.slice(0,75);
   const legacy=$('roleArtworkSection');
   if(legacy&&!legacy.hidden)legacy.scrollIntoView({behavior:'smooth',block:'start'});
   message('Open het bestaande uploadformulier; Cloud Storage is nog niet ingericht.');
   return;
  }
  const dep=$('libraryDept'),type=$('libraryKind'),
   code=$('libraryCode'),name=$('libraryLabel');
  if(dep){dep.value=dept.value;dep.dispatchEvent(new Event('change'));}
  if(type){type.value=kind;type.dispatchEvent(new Event('change'));}
  if(code)code.value=codeValue;
  if(name)name.value=label.slice(0,75);
  const panel=$('libraryPanel');
  if(panel&&!panel.hidden)panel.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function illustratedPicker(select,kind,label){
  const box=document.createElement('div');box.className='uniform-grade-gallery';box.hidden=true;
  const choices=[{code:'',label:'Automatisch / standaard',imageUrl:''},...candidates(kind)];
  for(const asset of choices){
   const btn=document.createElement('button');btn.type='button';
   btn.className='uniform-grade-choice';btn.setAttribute('aria-label',asset.label);
   btn.setAttribute('aria-pressed',String(select.value===asset.code));
   if(asset.imageUrl){
    const img=document.createElement('img');img.src=asset.imageUrl;
    img.loading='lazy';img.alt=asset.label;btn.append(img);
   }else{
    const placeholder=document.createElement('span');placeholder.className='uniform-grade-blank';
    placeholder.textContent='↺';btn.append(placeholder);
   }
   const name=document.createElement('small');name.textContent=asset.label;btn.append(name);
   btn.onclick=()=>{
    select.value=asset.code;select.dispatchEvent(new Event('change'));
    for(const child of box.querySelectorAll('.uniform-grade-choice'))
     child.setAttribute('aria-pressed',String(child===btn));
    box.hidden=true;
   };
   box.append(btn);
  }
  const trigger=document.createElement('button');trigger.type='button';trigger.className='alt';
  trigger.textContent='🖼 Bekijk alle tekeningen';
  trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-label','Toon gradenplaten met afbeelding voor '+label);
  trigger.onclick=()=>{box.hidden=!box.hidden;trigger.setAttribute('aria-expanded',String(!box.hidden))};
  return {trigger,box};
 }
 function makeRow(label,kind,target,selected,handler,illustrated=false){
  const line=document.createElement('div');line.className='uniform-quick-row';
  const title=document.createElement('span');title.className='uniform-quick-row-label';title.textContent=label;
  const select=makeSelect(kind,selected,label+' — '+(titles[kind]||'Uniform'));
  const thumb=document.createElement('img');thumb.className='uniform-quick-preview';
  thumb.alt='Voorbeeld van '+label;thumb.hidden=true;
  const updatePreview=()=>{
   const auto=target.selector;
   const policeAliases={'100':'ap','200':'ap','300':'ainp','400':'inp',
    '500':'1inp','600':'ahinp','700':'hinp','800':'1hinp',
    '900':'1hcp','910':'1cp','920':'acp','930':'acp'};
   const attempts=select.value?[select.value]:
    kind==='rank'&&dept.value==='politie'?
     [auto,policeAliases[auto]]:[auto];
   const match=candidates(kind).find(x=>attempts.includes(x.code));
   if(!match){thumb.hidden=true;thumb.removeAttribute('src');return;}
   thumb.src=match.imageUrl;thumb.hidden=false;
   thumb.title=select.value?'Geselecteerde afbeelding: '+match.label:
    'Automatisch herkend: '+match.label;
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
  buttons.append(upload,save);line.append(title,select,thumb,buttons);
  if(illustrated){
   const {trigger,box}=illustratedPicker(select,kind,label);
   buttons.prepend(trigger);line.append(box);
  }
  return line;
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
   },true));
  }
  makeHeading(marks,'2 · Kies de gradenplaat bij ieder uniform',
   'Open een geüpload uniform en kies per graad of functie een afbeelding uit de galerij. De tekening is meteen zichtbaar. Het oude standaarduniform staat niet in deze lijst.');
  const uniformAssets=candidates('uniform');
  if(!uniformAssets.length){
   const note=document.createElement('p');note.className='muted';
   note.textContent='Er zijn nog geen nieuwe uniformen geüpload voor deze hulpdienst. Upload eerst een uniform in de bibliotheek; oudere ingebouwde uniformen worden niet opnieuw aangeboden.';
   marks.append(note);
  }
  for(const coat of uniformAssets){
   const block=document.createElement('details');block.className='uniform-grade-coat';
   block.open=openCoatCode===coat.code;
   block.addEventListener('toggle',()=>{if(block.open)openCoatCode=coat.code});
   const summary=document.createElement('summary');
   const photo=document.createElement('img');photo.src=coat.imageUrl;photo.alt=coat.label;
   photo.loading='lazy';
   const caption=document.createElement('span');caption.textContent=coat.label+' — gradenplaten kiezen';
   summary.append(photo,caption);
   block.append(summary);
   const content=document.createElement('div');content.className='uniform-grade-coat-rows';
   for(const target of getMarkTargets()){
    for(const kind of target.kinds){
     const current=coatGrades.find(x=>x.department===dept.value&&x.uniformCode===coat.code&&
      x.kind===kind&&x.scope===target.scope&&x.selector===target.selector);
     const label=target.label+(target.kinds.length>1?' · '+titles[kind]:'');
     const row=makeRow(label,kind,target,current?.assetCode||'',async(assetCode,t)=>{
      const body={department:dept.value,uniformCode:coat.code,kind,
       scope:t.scope,selector:t.selector,assetCode,reason:reason.value.trim()};
      if(assetCode)await api('/api/uniform-grade-choices',{method:'PUT',body});
      else if(current)await api('/api/uniform-grade-choices',{method:'DELETE',body});
     },true);
     content.append(row);
    }
   }
   if(!content.children.length){
    const note=document.createElement('p');note.className='muted';
    note.textContent='Voor deze dienst worden er geen afzonderlijke gradenplaten aan uniformen gekoppeld.';
    content.append(note);
   }
   block.append(content);marks.append(block);
  }
  const advanced=document.createElement('details');advanced.className='uniform-grade-advanced';
  const summary=document.createElement('summary');summary.textContent='Geavanceerd: algemene gradenplaat per graad (onafhankelijk van uniform)';
  advanced.append(summary);
  for(const t of getMarkTargets()){
   for(const kind of t.kinds){
    const current=markRules.find(r=>r.department===dept.value&&r.kind===kind&&
     r.scope===t.scope&&r.selector===t.selector);
    const label=t.label+(t.kinds.length>1?' · '+titles[kind]:'');
    advanced.append(makeRow(label,kind,t,current?.assetCode||'',async(code,target)=>{
     const body={department:dept.value,kind,scope:target.scope,selector:target.selector,
      assetCode:code,reason:reason.value.trim()};
     if(code)await api('/api/uniform-library/rules',{method:'PUT',body});
     else if(current)await api('/api/uniform-library/rules',{method:'DELETE',body});
    },true));
   }
  }
  marks.append(advanced);
  const footer=document.createElement('div');footer.className='controls';
  footer.append(makeUploadLink());marks.append(footer);
 }
 async function reload(keep=false){
  const prev=dept.value;
  const [a,r,u,p,l,g]=await Promise.all([
   api('/api/role-artwork/manage'),
   api('/api/uniform-library/rules'),
   api('/api/uniform-assignments'),
   api('/api/organogram/hierarchie').catch(()=>({records:[]})),
   api('/api/uniform-library/status'),
   api('/api/uniform-grade-choices')
  ]);
  artwork=a.artworks||[];
  markRules=r.rules||[];
  coatGrades=g.choices||[];
  uniformAssignments=u.assignments||[];
  people=p.records||[];
  editable=(l.editableDepartments||[]).filter(d=>(u.editableDepartments||[]).includes(d));
  cloudReady=Boolean(l.storageReady);
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
