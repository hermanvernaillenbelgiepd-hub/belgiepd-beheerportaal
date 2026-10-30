// Visual-only uniform editor: one uniform, applicable groups, grade images, one save.
import {POLICE_UNIFORM_GROUPS,POLICE_CALL_GRADES,AMBULANCE_FUNCTIONS,normalizeVisual}
 from '/uniform-profile-policy.js';
import {getTier} from '/assets/organogram-hierarchie-model.js';
export function setupUniformStudio({api,$}){
 const dept=$('studioDept'),uniforms=$('studioUniforms'),groups=$('studioGroups'),
  grades=$('studioGrades'),pictures=$('studioPictures'),status=$('studioStatus'),
  save=$('studioSave'),preview=$('studioPreview'),patch=$('studioPatch');
 const services=[['politie','Politie'],['brandweer','Brandweer'],['ambulance','Ambulance'],
  ['depannage','Depannage'],['burger','Burger']];
 const aliases={'100':'ap','200':'ap','300':'ainp','400':'inp','500':'1inp','600':'ahinp',
  '700':'hinp','800':'1hinp','900':'1hcp','910':'1cp','920':'acp','930':'acp'};
 let assets=[],assignments=[],choices=[],staff=[],allowed=[],coat='',target=null,
  pendingUniforms=new Map(),pendingBadges=new Map(),busy=false;
 const el=(tag,cls,txt)=>{const x=document.createElement(tag);x.className=cls||'';
  if(txt!==undefined)x.textContent=txt;return x};
 const notify=(s,error=false)=>{status.textContent=s;status.classList.toggle('error',error)};
 const makeKey=(parts)=>parts.join('|');
 const imgOf=(kind,code)=>assets.find(x=>x.department===dept.value&&x.kind===kind&&
  x.code===code&&x.active!==false);
 const coats=()=>assets.filter(x=>x.department===dept.value&&x.kind==='uniform'&&
  x.active!==false&&!['silver','gold'].includes(x.code));
 const groupsFor=()=>{
  if(dept.value==='politie')return [
   {scope:'service',selector:'default',label:'Algemeen'},
   ...POLICE_UNIFORM_GROUPS.map(x=>({scope:'group',selector:x.code,label:x.label}))];
  if(dept.value==='ambulance')return [
   {scope:'service',selector:'default',label:'Iedereen'},
   ...AMBULANCE_FUNCTIONS.map(([selector,label])=>({scope:'function',selector,label}))];
  const levels=[...new Map(staff.filter(x=>x.dept===dept.value)
   .map(x=>[normalizeVisual(getTier(x)),getTier(x)]).filter(x=>x[0])).entries()];
  return [{scope:'service',selector:'default',label:'Iedereen'},
   ...levels.map(([selector,label])=>({scope:'cadre',selector,label}))];
 };
 const gradesFor=()=>{
  if(dept.value==='politie')return POLICE_CALL_GRADES.map(([selector,label])=>
   ({kind:'rank',scope:'call',selector,label:selector+' · '+label}));
  if(dept.value==='ambulance')return AMBULANCE_FUNCTIONS.map(([selector,label])=>
   ({kind:'profession',scope:'function',selector,label}));
  if(dept.value==='brandweer'){
   const ranks=[...new Map(staff.filter(x=>x.dept==='brandweer'&&x.rank)
    .map(x=>[normalizeVisual(x.rank),x.rank])).entries()];
   return ranks.sort((a,b)=>a[1].localeCompare(b[1],'nl')).flatMap(([selector,label])=>
    [{kind:'rank',scope:'rank',selector,label},
     {kind:'helmet',scope:'rank',selector,label:label+' · Helm'}]);
  }
  return [];
 };
 const uniformKey=t=>makeKey([dept.value,t.scope,t.selector]);
 const gradeKey=t=>makeKey([dept.value,coat,t.kind,t.scope,t.selector]);
 function selectedUniform(t){
  const k=uniformKey(t);
  return pendingUniforms.has(k)?pendingUniforms.get(k):
   assignments.find(x=>makeKey([x.department,x.scope,x.selector])===k)?.uniformCode||'';
 }
 function selectedGrade(t){
  const k=gradeKey(t);
  return pendingBadges.has(k)?pendingBadges.get(k):
   choices.find(x=>makeKey([x.department,x.uniformCode,x.kind,x.scope,x.selector])===k)?.assetCode||'';
 }
 function displayedGrade(t){
  if(!t)return null;
  const saved=selectedGrade(t);
  if(saved)return imgOf(t.kind,saved);
  const options=t.kind==='rank'&&dept.value==='politie'?
   [t.selector,aliases[t.selector]]:[t.selector];
  return options.map(c=>imgOf(t.kind,c)).find(Boolean)||null;
 }
 function refreshPreview(){
  const uniform=imgOf('uniform',coat),mark=displayedGrade(target);
  preview.hidden=!uniform;preview.src=uniform?.imageUrl||'';
  patch.hidden=!uniform||!mark;patch.src=mark?.imageUrl||'';
  $('studioPreviewTitle').textContent=uniform?.label||'Selecteer een uniform';
  $('studioPreviewGrade').textContent=target?.label||'Kies een graad';
 }
 function refreshSave(){
  const count=pendingUniforms.size+pendingBadges.size;
  save.disabled=busy||!count;
  $('studioPending').textContent=count?count+' wijziging(en) klaar':'Geen openstaande wijzigingen';
 }
 function renderUniforms(){
  uniforms.replaceChildren();
  const list=coats();
  if(!list.some(x=>x.code===coat))coat=list[0]?.code||'';
  if(!list.length)uniforms.append(el('p','muted','Nog geen nieuw uniform. Upload er een via de bibliotheek.'));
  for(const a of list){
   const button=el('button','studio-tile'+(coat===a.code?' active':''));
   button.type='button';button.setAttribute('aria-pressed',String(coat===a.code));
   const img=el('img');img.src=a.imageUrl;img.alt=a.label;img.loading='lazy';
   button.append(img,el('small','',a.label));
   button.onclick=()=>{coat=a.code;target=null;render()};
   uniforms.append(button);
  }
 }
 function renderGroups(){
  groups.replaceChildren();
  if(!coat)return;
  for(const t of groupsFor()){
   const active=selectedUniform(t)===coat;
   const b=el('button','studio-chip'+(active?' active':''),t.label);
   b.type='button';b.setAttribute('aria-pressed',String(active));
   b.onclick=()=>{
    const key=uniformKey(t),value=active?'':coat;
    const original=assignments.find(x=>makeKey([x.department,x.scope,x.selector])===key)?.uniformCode||'';
    if(original===value)pendingUniforms.delete(key);
    else pendingUniforms.set(key,value);
    renderGroups();refreshSave();
   };
   groups.append(b);
  }
 }
 function renderGrades(){
  grades.replaceChildren();
  for(const t of gradesFor()){
   const b=el('button','studio-grade'+(target?.selector===t.selector&&
    target?.kind===t.kind?' active':''));
   b.type='button';
   const icon=el('span','studio-grade-picture');
   const a=displayedGrade(t);
   if(a){const img=el('img');img.src=a.imageUrl;img.alt='';icon.append(img)}
   else icon.textContent='—';
   b.append(icon,el('span','',t.label));
   b.onclick=()=>{target=t;renderGrades();renderPictures();refreshPreview()};
   grades.append(b);
  }
  if(!grades.children.length)grades.append(el('p','muted',
   'Voor deze hulpdienst zijn geen afzonderlijke gradentekens ingesteld.'));
 }
 function renderPictures(){
  pictures.replaceChildren();
  if(!coat||!target){
   pictures.append(el('p','muted','Klik op een graad om de beschikbare tekeningen te kiezen.'));
   return;
  }
  const selected=selectedGrade(target);
  const a=[{code:'',label:'Standaardteken',imageUrl:''},
   ...assets.filter(x=>x.department===dept.value&&x.kind===target.kind&&x.active!==false)];
  for(const item of a){
   const b=el('button','studio-tile'+(item.code===selected?' active':''));
   b.type='button';b.setAttribute('aria-pressed',String(item.code===selected));
   if(item.imageUrl){const img=el('img');img.src=item.imageUrl;img.alt=item.label;img.loading='lazy';b.append(img)}
   else b.append(el('span','studio-default-icon','↺'));
   b.append(el('small','',item.label));
   b.onclick=()=>{
    const key=gradeKey(target);
    const initial=choices.find(x=>makeKey([x.department,x.uniformCode,x.kind,x.scope,x.selector])===key)?.assetCode||'';
    if(item.code===initial)pendingBadges.delete(key);
    else pendingBadges.set(key,item.code);
    renderPictures();renderGrades();refreshPreview();refreshSave();
   };
   pictures.append(b);
  }
 }
 function render(){renderUniforms();renderGroups();renderGrades();renderPictures();refreshPreview();refreshSave()}
 async function load(){
  const [a,b,c,d,e]=await Promise.all([
   api('/api/role-artwork/manage'),api('/api/uniform-assignments'),
   api('/api/uniform-grade-choices'),api('/api/organogram/hierarchie').catch(()=>({records:[]})),
   api('/api/uniform-library/status')]);
  assets=a.artworks||[];assignments=b.assignments||[];choices=c.choices||[];
  staff=d.records||[];
  allowed=(b.editableDepartments||[]).filter(x=>(e.editableDepartments||[]).includes(x));
  const previous=dept.value;dept.replaceChildren();
  for(const [id,name] of services)if(allowed.includes(id))dept.append(new Option(name,id));
  dept.value=allowed.includes(previous)?previous:allowed[0]||'';
  $('uniformStudio').hidden=!allowed.length;
  if(!allowed.length)return;
  render();
 }
 dept.onchange=()=>{
  if(pendingUniforms.size+pendingBadges.size&&!confirm('Er zijn niet-opgeslagen wijzigingen. Toch van dienst wisselen?')){
   dept.value=dept.dataset.before||dept.value;return;
  }
  dept.dataset.before=dept.value;coat='';target=null;render();
 };
 save.onclick=async()=>{
  if(busy)return;
  busy=true;refreshSave();let count=0;
  try{
   for(const [key,uniformCode] of [...pendingUniforms]){
    const [department,scope,selector]=key.split('|');
    const previous=assignments.find(x=>makeKey([x.department,x.scope,x.selector])===key);
    const badgeStyle=previous?.badgeStyle||'';
    const body={department,scope,selector,uniformCode,badgeStyle,
     reason:'Uniformstudio: uniformkeuze '+selector};
    if(!uniformCode&&!badgeStyle){
     if(previous)await api('/api/uniform-assignments',{method:'DELETE',body});
    }else await api('/api/uniform-assignments',{method:'PUT',body});
    pendingUniforms.delete(key);count++;
   }
   for(const [key,assetCode] of [...pendingBadges]){
    const [department,uniformCode,kind,scope,selector]=key.split('|');
    const previous=choices.find(x=>makeKey([x.department,x.uniformCode,x.kind,x.scope,x.selector])===key);
    const body={department,uniformCode,kind,scope,selector,assetCode,
     reason:'Uniformstudio: beeldkeuze '+selector};
    if(assetCode)await api('/api/uniform-grade-choices',{method:'PUT',body});
    else if(previous)await api('/api/uniform-grade-choices',{method:'DELETE',body});
    pendingBadges.delete(key);count++;
   }
   await load();notify(count+' wijziging(en) bewaard. De personeelsrechten blijven behouden.');
  }catch(e){await load().catch(()=>{});notify(count+' wijzigingen bewaard; overige mislukt: '+e.message,true)}
  finally{busy=false;refreshSave()}
 };
 $('studioUpload').onclick=()=>{
  const tab=document.querySelector('#manageTabs button[data-tab="artwork"]');
  if(tab)tab.click();
  const section=$('roleArtworkSection');
  if(section){section.scrollIntoView({behavior:'smooth',block:'start'});}
  notify('Upload een uniform of gradenplaat in de bibliotheek. Keer daarna terug naar de Uniformstudio.');
 };
 $('studioPositions').onclick=()=>{
  const advanced=document.querySelector('#uniformSection .uniform-legacy-editor');
  if(!advanced)return;
  advanced.open=true;advanced.scrollIntoView({behavior:'smooth',block:'start'});
 };
 $('studioReload').onclick=()=>{
  if((pendingUniforms.size+pendingBadges.size)&&
   !confirm('Niet-opgeslagen wijzigingen wissen?'))return;
  pendingUniforms.clear();pendingBadges.clear();
  load().then(()=>notify('Vernieuwd.')).catch(e=>notify(e.message,true));
 };
 return {load:()=>load().catch(e=>{notify(e.message,true);return false})};
}
