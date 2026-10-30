// Operational uniform composition: one grade, one preview, one save.
import {POLICE_CALL_GRADES,AMBULANCE_FUNCTIONS,normalizeVisual,policeCallSeries,ambulanceFunction} from '/uniform-profile-policy.js';
export function setupUniformComposer({api,$}){
 const dept=$('composeDept'),grade=$('composeGrade'),panel=$('composePreview'),
  gallery=$('composeGallery'),types=$('composeTypes'),save=$('composeSave'),notice=$('composeStatus');
 const kindNames={uniform:'Uniform',rank:'Gradenplaat',name:'Naamplaat',ribbons:'Erelint',
  medals:'Medaille',helmet:'Helm',profession:'Beroepsteken',logo:'Logo'};
 const defaults={name:[18,56,27,11],rank:[57,56,25,10],ribbons:[57,51,21,5],
  medals:[57,70,24,19],helmet:[19,4,62,32],profession:[55,42,24,12],logo:[72,26,14,14]};
 const services=[['politie','Politie'],['brandweer','Brandweer'],['ambulance','Ambulance'],
  ['depannage','Depannage'],['burger','Burger']];
 let images=[],templates=[],people=[],awards=[],draft=null,baseline='',active='uniform',
  sampleAward='',busy=false,visibleDepts=[],cloudReady=false,previousDept='',previousGrade='';
 const el=(tag,cls,text)=>{const v=document.createElement(tag);v.className=cls||'';
  if(text!==undefined)v.textContent=text;return v;};
 const notify=(msg,bad=false)=>{notice.textContent=msg;notice.classList.toggle('error',bad)};
 const asset=(kind,code)=>images.find(x=>x.department===dept.value&&x.kind===kind&&x.code===code);
 function ranks(){
  if(dept.value==='politie')return POLICE_CALL_GRADES.map(([code,title])=>['call',code,code+' · '+title]);
  if(dept.value==='ambulance')return AMBULANCE_FUNCTIONS.map(([code,title])=>['function',code,title]);
  const base=dept.value==='brandweer'?
   ['Zonecommandant','Kolonel','Majoor','Kapitein','Luitenant',
    'Adjudant','Sergeant','Korporaal','Brandweerman','Stagiair']:
   dept.value==='depannage'?
    ['Leiding','F.A.S.T','LSRA','Depannagetechnicus']:
    ['Burgerraad','Burger'];
  const all=new Map(base.map(label=>[normalizeVisual(label),label]));
  for(const person of people.filter(x=>x.dept===dept.value&&x.rank))
   all.set(normalizeVisual(person.rank),String(person.rank));
  return [...all].filter(([code])=>code).map(([code,title])=>['rank',code,title]);
 }
 function initialize(){
  const scope=grade.selectedOptions[0]?.dataset.scope||'rank';
  const saved=templates.find(x=>x.department===dept.value&&x.scope===scope&&x.selector===grade.value);
  // New atelier starts with saved compositions only. Never resurrect coats
  // from the retired per-service or per-cadre assignment system.
  const inherited='';
  const policeRank={'100':'ap','200':'ap','300':'ainp','400':'inp','500':'1inp',
   '600':'ahinp','700':'hinp','800':'1hinp','900':'1hcp','910':'1cp',
   '920':'acp','930':'acp'};
  const kind=dept.value==='ambulance'?'profession':'rank';
  const suggested=[grade.value,policeRank[grade.value]].filter(Boolean)
   .map(code=>images.find(x=>x.department===dept.value&&x.kind===kind&&x.code===code&&
    x.active!==false)?.code).find(Boolean)||'';
  draft={department:dept.value,scope,selector:grade.value,
   assets:{uniform:inherited,rank:kind==='rank'?suggested:'',helmet:'',
    profession:kind==='profession'?suggested:'',logo:'',...(saved?.assets||{})},
   layers:Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,{
    left:v[0],top:v[1],width:v[2],height:v[3],visible:true,...(saved?.layers?.[k]||{})}]))};
  baseline=JSON.stringify(draft);active='uniform';previousDept=dept.value;previousGrade=grade.value;render();
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
 function sampleMember(){
  const match=people.find(p=>p.dept===dept.value&&(
   draft.scope==='call'?policeCallSeries(p.call)===grade.value:
   draft.scope==='function'?ambulanceFunction(p)===grade.value:
    normalizeVisual(p.rank)===grade.value));
  const prefix=dept.value==='politie'?'SANTO-':
   dept.value==='ambulance'?'AZLS-':'';
  return {name:String(match?.name||'VOORBEELD').trim().toUpperCase(),
   call:String(match?.call||prefix+grade.value).trim().toUpperCase()};
 }
 function displayRank(){
  const label=grade.selectedOptions[0]?.textContent||'';
  return dept.value==='politie'?label.split(' · ').slice(1).join(' · ')||label:label;
 }
 const slots={
  name:{left:27.2,top:34.7,width:15.8,height:7.9},
  rank:{left:55.3,top:34.7,width:15.6,height:7.9}
 };
 function snapChest(){
  for(const kind of ['name','rank'])Object.assign(draft.layers[kind],slots[kind]);
  render();
  notify('Naam en gradenplaat zijn op de borstvlakken geplaatst. Sleep ze eventueel bij en bewaar het volledige uniform.');
 }
 $('composeSnapChest').onclick=snapChest;
 function draw(){
  panel.replaceChildren();
  const coat=asset('uniform',draft.assets.uniform);
  if(coat){
   const pic=el('img','compose-coat');pic.src=coat.imageUrl;pic.alt=coat.label;panel.append(pic);
   const onImage=()=>{
    if(pic!==panel.querySelector('.compose-coat')||!pic.naturalWidth||!pic.naturalHeight)return;
    // The editor and the live portrait must use the same natural image
    // coordinates; the old landscape preview caused visibly wrong offsets.
    panel.style.aspectRatio=pic.naturalWidth+'/'+pic.naturalHeight;
    const portrait=pic.naturalHeight/pic.naturalWidth>1.04&&dept.value==='politie';
    $('composeSnapChest').hidden=!portrait;
    const factory=(p,kind)=>{
     const near=(a,b)=>Math.abs(Number(a)-b)<0.65;
     return kind==='name'?near(p.left,18)&&near(p.top,56):
      near(p.left,57)&&near(p.top,56);
    };
    if(portrait&&!templates.some(x=>x.department===dept.value&&x.scope===draft.scope&&x.selector===draft.selector)&&
       factory(draft.layers.name,'name')&&factory(draft.layers.rank,'rank')){
     for(const kind of ['name','rank'])Object.assign(draft.layers[kind],slots[kind]);
     render();
    }
   };
   pic.addEventListener('load',onImage,{once:true});
   if(pic.complete&&pic.naturalWidth)onImage();
  }else{
   panel.style.aspectRatio='603/469';$('composeSnapChest').hidden=true;
   panel.append(el('p','compose-empty','Kies een basisuniform.'));return;
  }
  for(const [kind,position]of Object.entries(draft.layers)){
   const box=el('div','compose-layer'+(kind===active?' active':''));box.dataset.kind=kind;
   box.style.cssText='left:'+position.left+'%;top:'+position.top+'%;width:'+position.width+
    '%;height:'+position.height+'%;';box.hidden=!position.visible;
   const code=draft.assets[kind];let url=asset(kind,code)?.imageUrl||'';
   if(['ribbons','medals'].includes(kind))
    url=awards.find(x=>x.id===sampleAward&&x.kind===(kind==='medals'?'medal':'ribbon'))?.imageUrl||'';
   if(!url&&kind!=='name'&&kind!=='rank'&&kind!==active)continue;
   if(kind==='name'){
    const member=sampleMember();
    const level=grade.selectedOptions[0]?.textContent||'';
   const gold=dept.value==='politie'&&(
    ['900','910','920','930'].includes(grade.value)||
    /\b(?:ACP|CP|1-?CP|HCP|1-?HCP|Korpschef)\b/i.test(level));
   const plate=el('span','compose-nameplate '+(gold?'compose-metal-gold':'compose-metal-silver'));
    const name=el('strong','compose-name',member.name);
    const call=el('small','compose-call',member.call);
    name.style.setProperty('--name-length-factor',
     String(Math.max(.53,Math.min(1,15/Math.max(1,member.name.length)))));
    plate.append(name,call);
    const accent=el('span','compose-nameplate-left-accent');
    accent.setAttribute('aria-hidden','true');
    for(let index=0;index<4;index++)
     accent.append(el('span','compose-nameplate-left-accent-stripe'));
    plate.append(accent);
    box.append(plate);
    box.setAttribute('aria-label','Naamplaat: '+member.name+' · '+member.call);
   }else if(url){
    const img=el('img');img.src=url;img.alt=kindNames[kind];
    img.className=kind==='rank'?'compose-rank-image':'compose-art';
    box.append(img);
   }else{
    const text=kind==='rank'?displayRank():
     kind==='medals'?'✦':kind==='ribbons'?'▰':kindNames[kind];
    box.append(el('span',kind==='rank'?'compose-rank-caption':'compose-placeholder',text));
   }
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
    (active!=='uniform'||!['silver','gold','default'].includes(x.code)));
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
 dept.onchange=()=>{
  if(dirty()&&!window.confirm('Niet-opgeslagen uniformopmaak verwerpen?')){
   dept.value=previousDept;return;
  }
  loadRanks();
 };
 grade.onchange=()=>{
  if(dirty()&&!window.confirm('Niet-opgeslagen uniformopmaak verwerpen?')){
   grade.value=previousGrade;return;
  }
  initialize();
 };
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
  // The atelier alone determines the visibility of the uniform tab.
  $('uniformSection').dataset.authorized=visibleDepts.length?'yes':'no';
  cloudReady=Boolean(rights.storageReady);
  dept.replaceChildren();
  for(const [value,title]of services)if(visibleDepts.includes(value))dept.append(new Option(title,value));
  dept.value=visibleDepts.includes(before)?before:visibleDepts[0]||'';
  $('uniformComposer').hidden=!visibleDepts.length;
  if(visibleDepts.length)loadRanks(preserve?previous:'');
 }
 const uploadPanel=$('composeUploadPanel');
 $('composeUploadLink').onclick=()=>{
  uploadPanel.hidden=!uploadPanel.hidden;
  const type=active==='medals'?'medal':active==='ribbons'?'ribbon':active==='name'?'rank':active;
  $('composeUploadKind').value=type;
  if(!uploadPanel.hidden)$('composeUploadName').focus();
 };
 $('composeUploadClose').onclick=()=>{uploadPanel.hidden=true};
 const toDataUrl=file=>new Promise((ok,fail)=>{
  const read=new FileReader();read.onload=()=>ok(String(read.result));
  read.onerror=()=>fail(Error('Afbeelding kan niet gelezen worden'));
  read.readAsDataURL(file);
 });
 const toWebp=(file,small=false)=>new Promise((ok,fail)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onerror=()=>{URL.revokeObjectURL(url);fail(Error('Ongeldige afbeelding'))};
  img.onload=()=>{
   URL.revokeObjectURL(url);
   let ratio=Math.min(1,(small?220:1600)/Math.max(img.width,img.height));
   const max=small?80*1024:140*1024;
   for(let i=0;i<12;i++){
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*ratio));
    canvas.height=Math.max(1,Math.round(img.height*ratio));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    for(const q of [.9,.75,.6,.48,.35]){
     const uri=canvas.toDataURL('image/webp',q);
     if(uri.startsWith('data:image/webp;base64,')&&uri.length*3/4<max){
      ok(uri);return;
     }
    }
    ratio*=.8;
   }
   fail(Error('Afbeelding blijft te groot. Kies een kleinere afbeelding.'));
  };
  img.src=url;
 });
 $('composeUploadSave').onclick=async()=>{
  const file=$('composeUploadFile').files?.[0],name=$('composeUploadName').value.trim();
  const kind=$('composeUploadKind').value;
  if(!file||name.length<3||name.length>75||
   !['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){
   notify('Selecteer een PNG, JPG of WebP (max. 8 MB) en geef een naam.',true);return;
  }
  const before=structuredClone(draft),department=dept.value,scope=grade.dataset.scope,
   gradeCode=grade.value,slug=normalizeVisual(name).slice(0,22)||'afbeelding',
   code=(slug+'_'+Date.now().toString(36)).slice(0,40);
  const reason='Uniformatelier: afbeelding '+name+' toegevoegd';
  const button=$('composeUploadSave');button.disabled=true;
  try{
   if(kind==='medal'||kind==='ribbon'){
    if(department!=='politie')throw Error('Eretekencatalogus is voorlopig alleen voor politie.');
    const imageDataUri=await toWebp(file,true);
    const result=await api('/api/personnel-awards/catalog-upload',{method:'POST',body:{
     label:name,kind,color:'blue-gold',imageDataUri}});
    sampleAward=result.item?.id||'';
    active=kind==='medal'?'medals':'ribbons';
   }else{
    const dataUrl=cloudReady&&file.size<=4*1024*1024?
     await toDataUrl(file):await toWebp(file);
    const url=dataUrl.startsWith('data:image/webp;base64,')&&!cloudReady?
     '/api/role-artwork/personnel':'/api/uniform-library/assets';
    await api(url,{method:'PUT',body:{kind,code,department,label:name,reason,dataUrl}});
    active=kind;
   }
   await load(true);
   if(draft&&draft.department===department&&draft.scope===scope&&draft.selector===gradeCode){
    draft=before;
    if(!['medal','ribbon'].includes(kind))draft.assets[kind]=code;
   }
   uploadPanel.hidden=true;$('composeUploadFile').value='';$('composeUploadName').value='';
   active=kind==='medal'?'medals':kind==='ribbon'?'ribbons':kind;
   render();notify('Afbeelding opgeslagen. Kies de plaats en klik op Volledig uniform bewaren.');
  }catch(e){notify(e.message,true)}
  finally{button.disabled=false}
 };

 $('composeRefresh').onclick=()=>{
  if(dirty()&&!window.confirm('Niet-opgeslagen uniformopmaak verwerpen?'))return;
  load(true).catch(e=>notify(e.message,true));
 };
 return {load:()=>load().catch(e=>{$('uniformSection').dataset.authorized='no';notify(e.message,true);return false})};
}
