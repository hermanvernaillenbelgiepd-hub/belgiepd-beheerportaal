/* Form-driven editor for each page and each numbered card. Nothing here
 * grants or reads personnel permissions: server validates each page-design PUT.
 */
export function setupVisualPageEditor({api,$}){
 const colors=['Bg','Text','Border'];
 const fields=[
  ['radius',[0,4,8,12,16,20,24,28,32]],
  ['padding',[0,4,8,12,16,20,24,28,32,36,40]],
  ['fontSize',[11,12,13,14,15,16,17,18,20,22,24,26,28,30,32]],
  ['fontFamily',['inherit','inter','system','arial','georgia','verdana','trebuchet','tahoma']],
  ['fontWeight',['inherit','normal','medium','bold']],
  ['width',['default','narrow','regular','wide','full']],
  ['gridGap',[0,4,8,12,16,20,24,28,32,36,40]],
  ['minColumnWidth',[140,160,180,200,220,240,260,280,300,320,360,400]],
  ['columns',['auto','one','two','three','four']]
 ];
 const LABELS={inherit:'Overnemen',default:'Automatisch',normal:'Normaal',
  medium:'Halfvet',bold:'Vet',system:'Systeem',inter:'Inter',arial:'Arial',
  georgia:'Georgia',verdana:'Verdana',trebuchet:'Trebuchet',tahoma:'Tahoma',
  narrow:'Smal',regular:'Gemiddeld',wide:'Breed',full:'Volledige breedte',
  auto:'Dynamisch volgens scherm',one:'1 kolom',two:'2 kolommen',
  three:'3 kolommen',four:'4 kolommen'};
 let selectedPage='',revision=0,draft=[],active=false;
 const setStatus=(message,error=false)=>{
  $('studioStatus').textContent=message;
  $('studioStatus').classList.toggle('bad',error);
 };
 const fieldKey=(field)=>'studio-'+field;
 const currentTarget=()=>$('studioTarget').value;
 const chosenTheme=()=>$('studioTheme').value;
 const dataForTarget=()=>{
  let row=draft.find(row=>row.target===currentTarget());
  if(!row){row={target:currentTarget(),values:{}};draft.push(row)}
  return row.values;
 };
 const targetValues=()=>draft.find(row=>row.target===currentTarget())?.values||{};
 const presentColor=(kind)=>{
  const v=targetValues()[chosenTheme()+kind];
  const enabled=$(fieldKey(kind)+'Active');
  const picker=$(fieldKey(kind));
  enabled.checked=typeof v==='string';
  picker.disabled=!enabled.checked;
  picker.value=v||({light:{Bg:'#ffffff',Text:'#111827',Border:'#cbd5e1'},
   dark:{Bg:'#142640',Text:'#f2f6ff',Border:'#355477'}})[chosenTheme()][kind];
 };
 function showTarget(){
  for(const kind of colors)presentColor(kind);
  const values=targetValues();
  for(const [field] of fields){
   const value=values[field];
   $(fieldKey(field)).value=value===undefined?'':String(value);
  }
  $('studioGridFields').hidden=currentTarget()!=='grid';
  const grid=currentTarget()==='grid';
  $('studioPageWidthHint').textContent=currentTarget()==='page'?
   'Breedte van de volledige inhoud, zonder de navigatie aan te passen.':
   grid?'Automatische kolommen houden rekening met de beschikbare schermbreedte.':
   'Breedte van dit kader of deze groep, alleen binnen zijn beschikbare ruimte.';
  updatePreview();
 }
 function saveCurrent(){
  if(!active||!selectedPage)return;
  const values=dataForTarget();
  for(const kind of colors){
   const prop=chosenTheme()+kind,enabled=$(fieldKey(kind)+'Active').checked;
   if(enabled)values[prop]=$(fieldKey(kind)).value;
   else delete values[prop];
  }
  for(const [field,options]of fields){
   const chosen=$(fieldKey(field)).value;
   if(!chosen){delete values[field];continue}
   const option=options.find(o=>String(o)===chosen);
   if(option===undefined)delete values[field];
   else values[field]=option;
  }
  draft=draft.filter(row=>Object.keys(row.values).length>0);
  $('studioChangeCount').textContent=String(draft.length);
  updatePreview();
 }
 function updatePreview(){
  const values=targetValues(),theme=chosenTheme();
  const demo=$('studioPreviewCard'),button=$('studioPreviewButton'),
   label=$('studioPreviewHeading'),area=$('studioPreviewArea');
  const bg=values[theme+'Bg'],fg=values[theme+'Text'],
   border=values[theme+'Border'];
  demo.style.backgroundColor=bg||'';
  demo.style.color=fg||'';
  demo.style.borderColor=border||'';
  demo.style.borderRadius=values.radius===undefined?'':values.radius+'px';
  demo.style.padding=values.padding===undefined?'':values.padding+'px';
  const family={inter:'Inter,system-ui,sans-serif',system:'system-ui,sans-serif',
   arial:'Arial,sans-serif',georgia:'Georgia,serif',verdana:'Verdana,sans-serif',
   trebuchet:'Trebuchet MS,sans-serif',tahoma:'Tahoma,sans-serif'};
  demo.style.fontFamily=family[values.fontFamily]||'';
  demo.style.fontSize=values.fontSize?values.fontSize+'px':'';
  demo.style.fontWeight=({normal:'400',medium:'600',bold:'700'})[values.fontWeight]||'';
  demo.style.maxWidth=({narrow:'480px',regular:'760px',wide:'1180px',full:'none'})[values.width]||'';
  demo.style.width='100%';
  button.style.backgroundColor=currentTarget()==='buttons'?bg||'':'';
  button.style.color=currentTarget()==='buttons'?fg||'':'';
  button.style.borderColor=currentTarget()==='buttons'?border||'':'';
  label.style.color=currentTarget()==='headings'?fg||'':'';
  area.style.gridTemplateColumns=currentTarget()==='grid'&&values.columns&&values.columns!=='auto'?
   'repeat('+({one:1,two:2,three:3,four:4})[values.columns]+',minmax(0,1fr))':'repeat(auto-fit,minmax(120px,1fr))';
  area.style.gap=values.gridGap===undefined?'':values.gridGap+'px';
  const targetLabel=$('studioTarget').selectedOptions[0]?.textContent||'';
  $('studioPreviewCaption').textContent='Voorbeeld voor '+targetLabel+' · '+(theme==='dark'?'donker':'licht');
 }
 function formatName(filename){
  return filename.replace(/\.html$/,'').replaceAll('-',' ').replace(/\b\p{L}/gu,c=>c.toUpperCase());
 }
 async function loadPage(page){
  if(!active)return;
  if(!page)return;
  const result=await api('/api/visual-design/page-admin/'+encodeURIComponent(page));
  selectedPage=page;revision=result.revision;
  draft=(result.overrides||[]).map(item=>({target:item.target,values:{...item.values}}));
  $('studioRevision').textContent='Pagina-versie '+revision;
  $('studioInspect').href='/'+page+'?bpdDesignInspect=1';
  $('studioOpenPage').href='/'+page;
  $('studioChangeCount').textContent=String(draft.length);
  $('studioReason').value='';
  showTarget();
  setStatus('Pagina '+formatName(page)+' geladen. Kleurwijzigingen worden pas definitief na Publiceren.');
 }
 async function initialize(){
  const response=await api('/api/visual-design/pages');
  active=true;
  const pages=Array.isArray(response.pages)?response.pages:[];
  const dropdown=$('studioPage');dropdown.replaceChildren();
  for(const page of pages){
   const option=document.createElement('option');
   option.value=page;option.textContent=formatName(page);dropdown.append(option);
  }
  let start='index.html';
  try{const url=new URL(location.href).searchParams.get('page');if(pages.includes(url))start=url}
  catch{}
  if(!pages.includes(start))start=pages[0]||'';
  dropdown.value=start;
  $('studioEditor').hidden=false;
  await loadPage(start);
 }
 $('studioPage').addEventListener('change',()=>{
  void loadPage($('studioPage').value).catch(error=>setStatus('Laden mislukt: '+error.message,true));
 });
 $('studioTarget').addEventListener('change',showTarget);
 $('studioTheme').addEventListener('change',showTarget);
 for(const kind of colors){
  $(fieldKey(kind)+'Active').addEventListener('change',()=>{
   $(fieldKey(kind)).disabled=!$(fieldKey(kind)+'Active').checked;
   saveCurrent();
  });
  $(fieldKey(kind)).addEventListener('input',saveCurrent);
 }
 for(const [field] of fields)$(fieldKey(field)).addEventListener('change',saveCurrent);
 $('studioClearTarget').onclick=()=>{
  if(!active)return;
  draft=draft.filter(row=>row.target!==currentTarget());
  showTarget();$('studioChangeCount').textContent=String(draft.length);
  setStatus('Instellingen voor het geselecteerde onderdeel gewist in het voorbeeld; publiceer om te bewaren.');
 };
 $('studioClearPage').onclick=()=>{
  if(!active||!confirm('Alle aangepaste onderdelen voor deze pagina herstellen naar de standaard? Publiceren blijft vereist.'))return;
  draft=[];showTarget();$('studioChangeCount').textContent='0';
  setStatus('Standaardweergave voorbereid voor deze pagina. Publiceer om te bevestigen.');
 };
 $('studioReload').onclick=()=>void loadPage(selectedPage).catch(e=>setStatus(e.message,true));
 $('studioSave').onclick=async()=>{
  if(!active||!selectedPage)return;
  saveCurrent();
  const reason=$('studioReason').value.trim();
  if(reason.length<10||reason.length>240)
   return setStatus('Motivering van minimaal 10 en maximaal 240 tekens verplicht.',true);
  if(!confirm('Alle geselecteerde stijlwijzigingen voor '+formatName(selectedPage)+' publiceren?'))return;
  const button=$('studioSave');button.disabled=true;
  try{
   const response=await api('/api/visual-design/page-admin/'+encodeURIComponent(selectedPage),'PUT',{
    overrides:draft,expectedRevision:revision,reason
   });
   if(response.saved!==true)throw Error('Publicatie niet bevestigd');
   await loadPage(selectedPage);
   setStatus(response.changed?'Nieuwe pagina-opmaak gepubliceerd en gelogd.':'Geen nieuwe wijzigingen.');
  }catch(e){setStatus('Publicatie mislukt: '+e.message,true)}
  finally{button.disabled=false}
 };
 // Each card receives an inspector label in the actual page, without granting
 // any view rights. The logged-in user's existing access remains unchanged.
 return {initialize};
}
