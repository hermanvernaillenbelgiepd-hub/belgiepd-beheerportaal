// Operational uniform composition: one grade, one preview, one save.
import {POLICE_CALL_GRADES,AMBULANCE_FUNCTIONS,normalizeVisual} from '/uniform-profile-policy.js';
export function setupUniformComposer({api,$}){
 const dept=$('composeDept'),grade=$('composeGrade'),panel=$('composePreview'),
  gallery=$('composeGallery'),types=$('composeTypes'),save=$('composeSave'),notice=$('composeStatus');
 const kindNames={uniform:'Uniform',rank:'Gradenplaat',name:'Naamplaat',ribbons:'Erelint',
  medals:'Medaille',helmet:'Helm',profession:'Beroepsteken',logo:'Logo'};
 const defaults={name:[18,56,22,10],rank:[57,56,23,12],ribbons:[57,51,21,5],
  medals:[57,70,24,19],helmet:[19,4,62,32],profession:[55,42,24,12],logo:[72,26,14,14]};
 const services=[['politie','Politie'],['brandweer','Brandweer'],['ambulance','Ambulance'],
  ['depannage','Depannage'],['burger','Burger']];
 let images=[],templates=[],people=[],awards=[],draft=null,baseline='',active='uniform',
  sampleAward='',busy=false,visibleDepts=[];
 const el=(tag,cls,text)=>{const v=document.createElement(tag);v.className=cls||'';
  if(text!==undefined)v.textContent=text;return v;};
 const notify=(msg,bad=false)=>{notice.textContent=msg;notice.classList.toggle('error',bad)};
 const asset=(kind,code)=>images.find(x=>x.department===dept.value&&x.kind===kind&&x.code===code);
 function ranks(){
  if(dept.value==='politie')return POLICE_CALL_GRADES.map(([code,title])=>['call',code,code+' · '+title]);
  if(dept.value==='ambulance')return AMBULANCE_FUNCTIONS.map(([code,title])=>['function',code,title]);
  return [...new Map(people.filter(x=>x.dept===dept.value&&x.rank)
   .map(x=>[normalizeVisual(x.rank),x.rank])).entries()]
   .sort((a,b)=>a[1].localeCompare(b[1],'nl')).map(([code,title])=>['rank',code,title]);
 }
 function initialize(){
  const scope=grade.selectedOptions[0]?.dataset.scope||'rank';
  const saved=templates.find(x=>x.department===dept.value&&x.scope===scope&&x.selector===grade.value);
  draft={department:dept.value,scope,selector:grade.value,
   assets:{uniform:'',rank:'',helmet:'',profession:'',logo:'',...(saved?.assets||{})},
   layers:Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,{
    left:v[0],top:v[1],width:v[2],height:v[3],visible:true,...(saved?.layers?.[k]||{})}]))};
  baseline=JSON.stringify(draft);active='uniform';render();
 }
 function loadRanks(previous=''){
  grade.replaceChildren();
  for(const [scope,code,title]of ranks()){
   const item=new Option(title,code);item.dataset.scope=scope;grade.append(item);
  }
  if([...grade.options].some(x=>x.value===previous))grade.value=previous;
  initialize();
 }
 const dirty=()=>draft&&baseline!==JSON.stringify(draft);
 function updateSave(){
  save.disabled=busy||!draft?.assets.uniform||!dirty();
  $('composePending').textContent=dirty()?'Niet opgeslagen':'Alles opgeslagen';
 }
 function draw(){
  panel.replaceChildren();
  const coat=asset('uniform',draft.assets.uniform);
  if(coat){const pic=el('img','compose-coat');pic.src=coat.imageUrl;pic.alt=coat.label;panel.append(pic)}
  else panel.append(el('p','compose-empty','Kies een basisuniform.'));
  for(const [kind,position]of Object.entries(draft.layers)){
   const box=el('div','compose-layer'+(kind===active?' active':''));box.dataset.kind=kind;
   box.style.cssText='left:'+position.left+'%;top:'+position.top+'%;width:'+position.width+
    '%;height:'+position.height+'%;';box.hidden=!position.visible;
   const code=draft.assets[kind];let url=asset(kind,code)?.imageUrl||'';
   if(['ribbons','medals'].includes(kind))
    url=awards.find(x=>x.id===sampleAward&&x.kind===(kind==='medals'?'medal':'ribbon'))?.imageUrl||'';
   if(url){const img=el('img');img.src=url;img.alt='';box.append(img)}
   else box.append(el('span','',kind==='name'?'NAAM / CALL':kind==='medals'?'✦':
    kind==='ribbons'?'▰':kind==='rank'?'GRAAD':kindNames[kind]));
   box.title=kindNames[kind]+' verplaatsen';
   box.onpointerdown=e=>{
    e.preventDefault();active=kind;box.setPointerCapture(e.pointerId);
    box.dataset.x=e.clientX;box.dataset.y=e.clientY;
    box.dataset.left=position.left;box.dataset.top=position.top;
    drawTools();drawGallery();readControls();
   };
   box.onpointermove=e=>{
    if(!box.hasPointerCapture(e.pointerId))return;
    const rect=panel.getBoundingClientRect();
    position.left=+Math.max(0,Math.min(100-position.width,Number(box.dataset.left)+
     (e.clientX-Number(box.dataset.x))/rect.width*100)).toFixed(2);
    position.top=+Math.max(0,Math.min(100-position.height,Number(box.dataset.top)+
     (e.clientY-Number(box.dataset.y))/rect.height*100)).toFixed(2);
    box.style.left=position.left+'%';box.style.top=position.top+'%';
    readControls();updateSave();
   };
   panel.append(box);
  }
  $('composeGradeTitle').textContent=grade.selectedOptions[0]?.textContent||'';
 }
 function drawTools(){
  types.replaceChildren();
  for(const kind of Object.keys(kindNames)){
   if(kind==='helmet'&&dept.value!=='brandweer')continue;
   if(kind==='profession'&&dept.value!=='ambulance')continue;
   if(['medals','ribbons'].includes(kind)&&dept.value!=='politie')continue;
   const b=el('button','compose-type'+(kind===active?' active':''),kindNames[kind]);
   b.type='button';b.onclick=()=>{active=kind;render()};types.append(b);
  }
 }
 function drawGallery(){
  gallery.replaceChildren();
  $('composeGalleryTitle').textContent=kindNames[active]+' kiezen';
  if(active==='name'){
   gallery.append(el('p','muted','Naam en CALL zijn automatisch. Versleep het naamplaatje op het uniform.'));return;
  }
  const medal=['medals','ribbons'].includes(active);
  const list=medal?awards.filter(x=>x.kind===(active==='medals'?'medal':'ribbon')):
   images.filter(x=>x.department===dept.value&&x.kind===active&&x.active!==false&&
    (active!=='uniform'||!['silver','gold'].includes(x.code)));
  if(active!=='uniform'&&!medal){
   const clear=el('button','compose-choice','Automatisch / verbergen');
   clear.type='button';clear.onclick=()=>{draft.assets[active]='';render()};gallery.append(clear);
  }
  if(!list.length)gallery.append(el('p','muted','Nog geen afbeeldingen: gebruik de knop Upload.'));
  for(const item of list){
   const code=medal?item.id:item.code;
   const selected=medal?sampleAward===code:draft.assets[active]===code;
   const b=el('button','compose-choice'+(selected?' active':''));b.type='button';
   b.setAttribute('aria-pressed',String(selected));
   if(item.imageUrl){const img=el('img');img.src=item.imageUrl;img.alt=item.label;img.loading='lazy';b.append(img)}
   else b.append(el('span','compose-symbol','✦'));
   b.append(el('small','',item.label));
   b.onclick=()=>{if(medal)sampleAward=code;else draft.assets[active]=code;render()};
   gallery.append(b);
  }
 }
 function readControls(){
  $('composePosition').hidden=active==='uniform';
  const p=draft.layers[active];if(!p)return;
  for(const [key,id]of [['left','composeX'],['top','composeY'],
   ['width','composeW'],['height','composeH']]){
   $(id).value=p[key];$('composeText'+key).textContent=p[key]+'%';
  }
  $('composeVisible').checked=p.visible;
 }
 function render(){if(!draft)return;drawTools();drawGallery();draw();readControls();updateSave()}
 for(const [id,key]of [['composeX','left'],['composeY','top'],
  ['composeW','width'],['composeH','height']]){
  $(id).oninput=e=>{
   const p=draft.layers[active];if(!p)return;
   p[key]=Math.min(Number(e.target.value),
    key==='left'?100-p.width:key==='top'?100-p.height:
    key==='width'?100-p.left:100-p.top);
   draw();readControls();updateSave();
  };
 }
 $('composeVisible').onchange=e=>{draft.layers[active].visible=e.target.checked;render()};
 dept.onchange=()=>loadRanks();
 grade.onchange=initialize;
 save.onclick=async()=>{
  if(!draft||busy)return;busy=true;updateSave();
  try{
   await api('/api/uniform-compositions',{method:'PUT',body:{
    ...draft,reason:'Uniformatelier opmaak voor '+dept.value+' '+grade.value}});
   await load(true);
   notify('Uniformopmaak voor de graad opgeslagen.');
  }catch(e){notify(e.message,true)}
  finally{busy=false;updateSave()}
 };
 async function load(preserve=false){
  const before=dept.value,previous=grade.value;
  const [media,records,persons,rights,catalog]=await Promise.all([
   api('/api/role-artwork/manage'),api('/api/uniform-compositions'),
   api('/api/organogram/hierarchie').catch(()=>({records:[]})),
   api('/api/uniform-library/status'),api('/api/uniform-compositions/award-catalog')]);
  images=media.artworks||[];templates=records.compositions||[];
  people=persons.records||[];awards=catalog.catalog||[];
  visibleDepts=rights.editableDepartments||[];
  dept.replaceChildren();
  for(const [value,title]of services)if(visibleDepts.includes(value))dept.append(new Option(title,value));
  dept.value=visibleDepts.includes(before)?before:visibleDepts[0]||'';
  $('uniformComposer').hidden=!visibleDepts.length;
  if(visibleDepts.length)loadRanks(preserve?previous:'');
 }
 $('composeRefresh').onclick=()=>load(true).catch(e=>notify(e.message,true));
 return {load:()=>load().catch(e=>{notify(e.message,true);return false})};
}
