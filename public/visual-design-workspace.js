import {setupVisualDesignEditor} from '/visual-design-editor.js';
import {setupVisualDesignGrantsEditor} from '/visual-design-grants-editor.js';
const $=id=>document.getElementById(id);
let auth=null,initialized=false,globalEditor=null,grantsEditor=null;
let catalog=[],currentPage='',pageRevision=0,pageStyles={},selectedSlot='page';
let pageSeq=0,sectionSelectInitialized=false;
const status=(message,bad=false)=>{
 const el=$('pageStatus');el.textContent=message;el.style.color=bad?'var(--bad)':'var(--muted)';
};
const notice=(message,bad=false)=>{
 $('notice').textContent=message;$('notice').classList.toggle('bad',bad);
};
const props=[
 ['Achtergrond','background','color','#ffffff'],
 ['Tekstkleur','textColor','color','#172c47'],
 ['Koptitels','headingColor','color','#254984'],
 ['Randkleur','borderColor','color','#bdc9d9'],
 ['Knopachtergrond','buttonBackground','color','#315fc2'],
 ['Knoptekst','buttonText','color','#ffffff'],
 ['Knoprand','buttonBorder','color','#315fc2'],
 ['Linkkleur','linkColor','color','#2655aa'],
 ['Lettertype','fontFamily','select','inter',
  [['inter','Inter'],['system','Systeem'],['arial','Arial'],['verdana','Verdana'],
   ['tahoma','Tahoma'],['trebuchet','Trebuchet MS'],['georgia','Georgia'],
   ['times','Times New Roman'],['courier','Courier New']]],
 ['Lettergrootte (px)','fontSize','number',14,[10,26,1]],
 ['Tekstdikte','fontWeight','select',400,[[400,'Normaal'],[500,'Medium'],[600,'Halfvet'],[700,'Vet']]],
 ['Tekstuitlijning','textAlign','select','left',[['left','Links'],['center','Midden'],['right','Rechts']]],
 ['Binnenruimte (px)','padding','number',16,[0,48,1]],
 ['Tussenruimte (px)','gap','number',12,[0,48,1]],
 ['Hoekafronding (px)','radius','number',10,[0,40,1]],
 ['Randdikte (px)','borderWidth','number',1,[0,5,1]],
 ['Schaduw','shadow','select','subtle',
  [['none','Geen'],['subtle','Subtiel'],['medium','Normaal'],['strong','Sterk']]],
 ['Maximale breedte (px)','maxWidth','number',0,[0,1800,20]],
 ['Minimale hoogte (px)','minHeight','number',0,[0,720,10]],
 ['Knopafronding (px)','buttonRadius','number',8,[0,40,1]],
 ['Knoplettergrootte (px)','buttonFontSize','number',14,[10,26,1]],
 ['Minimale kolombreedte (px)','minColumnWidth','number',260,[160,500,10]],
 ['Kolommen bij breed scherm','columns','select','auto',
  [['auto','Automatisch'],['1','1 kolom'],['2','2 kolommen'],['3','3 kolommen'],['4','4 kolommen']]]
];
const controls={};
function createProperties(){
 const root=$('propertyFields');root.replaceChildren();
 for(const [label,key,type,defaultValue,options] of props){
  const row=document.createElement('div');row.className='prop';
  const toggleLabel=document.createElement('label');toggleLabel.className='enable';
  const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',label+' aanpassen');
  const title=document.createElement('span');title.textContent=label;
  toggleLabel.append(check,title);row.append(toggleLabel);
  let control;
  if(type==='select'){
   control=document.createElement('select');
   for(const [value,text] of options){
    const option=document.createElement('option');option.value=String(value);
    option.textContent=text;control.append(option);
   }
  }else{
   control=document.createElement('input');control.type=type;
   if(type==='number'){
    const [min,max,step]=options;control.min=min;control.max=max;control.step=step;
    control.inputMode='numeric';
    // 0 stands for unlimited width only. Other values are at least 280.
    if(key==='maxWidth')control.title='0 = geen maximale breedte; anders 280–1800';
   }
  }
  control.value=String(defaultValue);control.disabled=true;
  control.setAttribute('aria-label',label);
  const changed=()=>{control.disabled=!check.checked;preview()};
  check.addEventListener('change',changed);
  control.addEventListener('input',preview);
  control.addEventListener('change',preview);
  controls[key]={check,control,defaultValue,type};
  row.append(control);root.append(row);
 }
}
function readControls(){
 const style={};
 for(const [key,{check,control,type}] of Object.entries(controls)){
  if(!check.checked)continue;
  const value=type==='number'||key==='fontWeight'?Number(control.value):control.value;
  if((type==='number'&&!Number.isSafeInteger(value))||
     (key==='maxWidth'&&value>0&&value<280))return null;
  style[key]=value;
 }
 return style;
}
function fillControls(style){
 for(const [key,{check,control,defaultValue}] of Object.entries(controls)){
  check.checked=Object.hasOwn(style,key);
  control.disabled=!check.checked;
  control.value=String(style[key]??defaultValue);
 }
}
function slotKey(){return $('pageTheme').value+'|'+selectedSlot}
function frameEngine(){
 try{return $('pageFrame').contentWindow?.BPDPageDesign||null}catch{return null}
}
function preview(){
 const style=readControls();
 if(style===null)return status('Controleer numerieke waarden; maximale breedte is 0 of minimaal 280.',true);
 const engine=frameEngine();
 if(!engine)return;
 engine.preview({slot:selectedSlot,theme:$('pageTheme').value,style});
 const theme=$('pageTheme').value;
 if(theme!=='both'){
  try{$('pageFrame').contentDocument.documentElement.dataset.bpdTheme=theme}catch{}
 }
 status('Voorbeeld gewijzigd. Publiceren is nodig voordat andere gebruikers dit zien.');
}
function selectSlot(slot){
 selectedSlot=slot;
 const list=$('slotSelect');
 if([...list.options].some(x=>x.value===slot))list.value=slot;
 fillControls(pageStyles[slotKey()]||{});
 const engine=frameEngine();engine?.restore();engine?.pick(slot);
}
function refreshFrames(){
 const engine=frameEngine();
 const frames=engine?.getFrames()||[{slot:'page',label:'Volledige pagina / hoofdinhoud'}];
 const select=$('slotSelect');select.replaceChildren();
 for(const row of frames){
  const option=document.createElement('option');option.value=row.slot;
  option.textContent=row.label+' · '+row.slot;select.append(option);
 }
 if(!frames.some(row=>row.slot===selectedSlot))selectedSlot='page';
 selectSlot(selectedSlot);
}
async function api(path,method='GET',body){
 if(!auth?.currentUser)throw Error('Meld aan met een geldig portaalaccount');
 const token=await auth.currentUser.getIdToken();
 const result=await fetch(path,{method,cache:'no-store',credentials:'same-origin',
  headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 const payload=await result.json().catch(()=>({}));
 if(!result.ok)throw Error(payload.error||'Fout '+result.status);
 return payload;
}
async function loadHistory(key){
 try{
  const data=await api('/api/visual-design/pages/'+encodeURIComponent(key)+'/history');
  const root=$('pageHistory');root.replaceChildren();
  for(const item of data.history||[]){
   const li=document.createElement('li');
   const date=item.at?new Date(item.at).toLocaleString('nl-BE'):'Datum onbekend';
   li.textContent=date+' · '+item.slot+' · '+item.theme+' · '+item.reason;
   root.append(li);
  }
  if(!root.children.length)root.textContent='Geen wijzigingen geregistreerd.';
 }catch{$('pageHistory').textContent='Historiek tijdelijk niet beschikbaar.'}
}
async function changePage(){
 const key=$('pageSelect').value;
 if(!/^[a-z0-9-]+$/.test(key))return;
 currentPage=key;const seq=++pageSeq;selectedSlot='page';
 $('openPage').href=key==='index'?'/':'/'+key+'.html';
 $('pageFrame').src=(key==='index'?'/':'/'+key+'.html')+'?bpdDesignPreview=1';
 status('Pagina-instellingen ophalen...');
 try{
  const data=await api('/api/visual-design/pages/'+encodeURIComponent(key));
  if(seq!==pageSeq)return;
  pageRevision=data.revision||0;
  pageStyles=data.styles||{};
  fillControls(pageStyles[slotKey()]||{});
  status('Pagina geladen · versie '+pageRevision+'. Kies een kader in het voorbeeld.');
  void loadHistory(key);
 }catch(e){if(seq===pageSeq)status('Pagina-instellingen niet beschikbaar: '+e.message,true)}
}
async function savePage(){
 if(!currentPage)return;
 const style=readControls();
 if(style===null)return status('Controleer de afmetingen voordat je publiceert.',true);
 const reason=$('pageReason').value.trim();
 if(reason.length<10||reason.length>240)
  return status('Motivering van 10–240 tekens verplicht.',true);
 const button=$('savePage');button.disabled=true;
 try{
  const result=await api('/api/visual-design/pages/'+encodeURIComponent(currentPage),'PUT',{
   slot:selectedSlot,theme:$('pageTheme').value,style,reason,expectedRevision:pageRevision
  });
  if(result.saved!==true)throw Error('Opslaan niet bevestigd');
  const refreshed=await api('/api/visual-design/pages/'+encodeURIComponent(currentPage));
  pageRevision=refreshed.revision;
  pageStyles=refreshed.styles||{};
  await frameEngine()?.reload();
  frameEngine()?.pick(selectedSlot);
  status('Kaderopmaak '+(result.changed?'gepubliceerd en gelogd.':'is al gelijk aan de bestaande versie.'));
  void loadHistory(currentPage);
 }catch(e){status('Niet gepubliceerd: '+e.message,true)}
 finally{button.disabled=false}
}
function setTab(id){
 for(const name of ['pages','global','rights'])$(name+'Tab').hidden=name!==id;
 for(const button of document.querySelectorAll('[data-tab]'))
  button.setAttribute('aria-selected',String(button.dataset.tab===id));
}
async function boot(){
 if(!auth?.currentUser){$('work').hidden=true;notice('Meld je aan via Discord of je bestaande portaalaccount.');return}
 try{
  const data=await api('/api/visual-design/pages/catalog');
  catalog=data.pages||[];
  const select=$('pageSelect');select.replaceChildren();
  for(const entry of catalog){
   const option=document.createElement('option');option.value=entry.key;
   option.textContent=entry.label+' ('+entry.key+'.html)';select.append(option);
  }
  $('work').hidden=false;
  notice('Vormgevingsrechten bevestigd. Je kunt alleen opmaak beheren, niet de personeelsgegevens of toegangsrechten.');
  if(!initialized){
   initialized=true;
   globalEditor=setupVisualDesignEditor({api,$});
   if(data.canDelegate){
    grantsEditor=setupVisualDesignGrantsEditor({api,$});
    // Use a separate visible rights tab, not a hidden subsection of the global editor.
    $('rightsTab').append($('visualGrantPanel'));
   }
  }
  if(data.canDelegate){
   $('rightsHint').textContent='Je bent geverifieerd als Technisch Beheer. Hier kun je vormgevingsrechten tijdelijk geven en op elk moment intrekken.';
   void grantsEditor?.load().catch(e=>{$('rightsHint').textContent='Machtigingen laden mislukt: '+e.message});
  }else{
   $('rightsHint').textContent='Machtigingen uitdelen of intrekken kan uitsluitend met het profiel Technisch Beheer. Schakel dit zo nodig in via Mijn profiel. Als Officierenkader kun je wel de vormgeving beheren, maar geen machtigingen toekennen.';
  }
  void globalEditor?.load().catch(e=>notice('Algemene vormgeving tijdelijk niet beschikbaar: '+e.message,true));
  select.value=catalog.some(x=>x.key==='personeelsbeheer')?'personeelsbeheer':catalog[0]?.key||'index';
  await changePage();
 }catch(e){
  $('work').hidden=true;
  notice('Vormgevingsbeheer niet beschikbaar: '+e.message+
   ' Gebruik Mijn profiel om Technisch Beheer te activeren of vraag een afzonderlijke vormgevingsmachtiging.',true);
 }
}
function register(){
 createProperties();
 $('pageSelect').addEventListener('change',changePage);
 $('slotSelect').addEventListener('change',()=>selectSlot($('slotSelect').value));
 $('pageTheme').addEventListener('change',()=>{selectSlot(selectedSlot);preview()});
 $('savePage').addEventListener('click',savePage);
 $('reloadPage').addEventListener('click',async()=>{
  fillControls(pageStyles[slotKey()]||{});
  frameEngine()?.restore();frameEngine()?.pick(selectedSlot);
  status('Voorbeeld teruggezet naar de gepubliceerde stijl.');
 });
 $('clearStyle').addEventListener('click',()=>{fillControls({});preview()});
 $('refreshFrames').addEventListener('click',refreshFrames);
 for(const item of document.querySelectorAll('[data-tab]'))
  item.addEventListener('click',()=>setTab(item.dataset.tab));
 for(const button of document.querySelectorAll('[data-preview-size]')){
  button.addEventListener('click',()=>{
   $('pageFrame').dataset.previewWidth=button.dataset.previewSize;
   for(const peer of document.querySelectorAll('[data-preview-size]'))
    peer.setAttribute('aria-pressed',String(peer===button));
  });
 }
 $('pageFrame').addEventListener('load',()=>{
  refreshFrames();
  try{
   $('pageFrame').contentDocument.addEventListener('click',event=>{
    // Editing mode: selecting a frame must never submit a real form.
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const target=event.target.closest('[data-bpd-page-frame]');
    if(target?.dataset.bpdPageFrame)selectSlot(target.dataset.bpdPageFrame);
   },true);
  }catch{}
 });
}
async function init(){
 register();
 try{
  const config=await fetch('/api/client-config',{cache:'no-store'}).then(r=>r.json());
  if(!config.enabled)throw Error('Firebase niet beschikbaar');
  const appSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
  const authSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
  const app=appSdk.getApps()[0]||appSdk.initializeApp(config.firebaseConfig);
  auth=authSdk.getAuth(app);
  const {setupPortalLogin}=await import('/portal-login.js');
  setupPortalLogin({button:$('login'),auth,authModule:authSdk,config,
   onError:e=>notice('Aanmelden mislukt: '+e.message,true)});
  authSdk.onAuthStateChanged(auth,user=>{
   $('login').textContent=user?'Afmelden':'Aanmelden';
   void boot();
  });
 }catch(e){notice('Vormgeving aanmelden lukt niet: '+e.message,true)}
}
void init();
