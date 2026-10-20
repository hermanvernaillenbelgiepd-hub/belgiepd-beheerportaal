import {setupPortalLogin} from '/portal-login.js';
import {summarizeTOCrews} from '/to-crew-counts.js';
import {TO_CATEGORIES,serviceForCategory,groupByTOService} from '/to-categories.js';
import {teamVisual} from '/to-team-visuals.js';
import {radioNBForTeam,groupRadioCrews} from '/to-radio-availability.js';

const el=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=value=>Array.isArray(value)?value:Object.values(value||{});
const timeFormat=new Intl.DateTimeFormat('nl-BE',{hour:'2-digit',minute:'2-digit'});
const dateFormat=new Intl.DateTimeFormat('nl-BE',{day:'numeric',month:'short',year:'numeric'});
const time=value=>Number.isFinite(Number(value))&&value?timeFormat.format(new Date(Number(value))):'—';
const date=value=>Number.isFinite(Number(value))&&value?dateFormat.format(new Date(Number(value))):'—';
const duration=value=>{const minutes=Math.max(0,Math.floor((Date.now()-Number(value))/60000));return minutes>=60?Math.floor(minutes/60)+'u '+String(minutes%60).padStart(2,'0')+'m':minutes+'m';};
const incidentNumber=value=>'M-'+String(value||0).padStart(3,'0');
const activeTeams=board=>rows(board?.ploegen).filter(team=>!team.endedAt);
const incidents=board=>rows(board?.meldingen);
const normalize=value=>String(value||'').toLocaleLowerCase('nl-BE');
const matches=(...values)=>!state.query||values.some(value=>normalize(value).includes(state.query));
function matchesCategory(category){return state.category==='all'||state.category===category||state.category==='service:'+serviceForCategory(category).id;}
function categoryRank(category){const rank=TO_CATEGORIES.indexOf(category);return rank<0?Number.MAX_SAFE_INTEGER:rank;}
function compareCategories(left,right){return categoryRank(left)-categoryRank(right)||String(left||'').localeCompare(String(right||''),'nl',{numeric:true});}
function compareRadioUsers(left,right){
  const number=value=>/^\d{1,5}$/.test(String(value))&&Number(value)>0?Number(value):Number.MAX_SAFE_INTEGER;
  return compareCategories(left.category,right.category)||number(left.number)-number(right.number)||String(left.displayName||left.name||'').localeCompare(String(right.displayName||right.name||''),'nl',{numeric:true})||String(left.id||'').localeCompare(String(right.id||''));
}
function categoryOptions(categories,{services=false}={}){
  return groupByTOService(categories,category=>category).map(service=>`<optgroup label="${esc(service.label)}">${services?`<option value="service:${esc(service.id)}">Alle ${esc(service.label)}</option>`:''}${service.items.slice().sort(compareCategories).map(category=>`<option value="${esc(category)}">${esc(category)}</option>`).join('')}</optgroup>`).join('');
}
function operatorName(uid,session=state.env?.board.session){
  if(uid===session?.ownerUid)return session.to;
  for(const item of (session?.handovers||[]).slice().reverse()){
    if(item.toUid===uid)return item.to;
    if(item.fromUid===uid)return item.from;
  }
  return 'Portaalcollega';
}
// Uniform, text-labelled visual markers. Color is an aid, never the only identifier.
const unitBadge=(category,variant='')=>{
  const identity=teamVisual(category);
  return '<span class="unit-token'+(variant?' '+variant:'')+
    '" data-unit-service="'+esc(identity.serviceId)+'" style="--unit-hue:'+identity.hue+
    '" title="'+esc(identity.label)+'" aria-label="Categorie '+esc(identity.label)+'">'+
    esc(identity.code)+'</span>';
};
const pill=(text,color='gray')=>`<span class="pill ${color}">${esc(text)}</span>`;
const empty=(title,text)=>`<div class="empty-state"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
const button=(text,action,{id='',teamId='',primary=false,danger=false,small=false,disabled=false,write=false}={})=>`<button type="button" class="button${primary?' button-primary':''}${danger?' button-danger':''}${small?' button-small':''}" data-action="${action}"${id?` data-id="${esc(id)}"`:''}${teamId?` data-team-id="${esc(teamId)}"`:''}${write?' data-write':''}${disabled?' disabled':''}>${esc(text)}</button>`;

let auth=null,authEpoch=0;
const state={env:null,stale:true,pending:false,view:'board',query:'',category:'all',filter:'actief',archives:null,archive:null,lastSynced:null};
const radio={snapshot:null,loading:false,error:null,receivedAt:null,requestSerial:0,knownIds:null,newIds:new Set()};
const INCIDENT_PRESETS=Object.freeze(['ANPR','AGRESSIE','VKO','BRAND','TAKELING','DIEFSTAL','VERDACHTE SITUATIE','MEDISCHE BIJSTAND']);
const dialog=el('to-dialog');
let toastTimer;

function tell(message,kind=''){
  el('feedback').textContent=message;
  el('feedback').className='feedback'+(kind?' '+kind:'');
}
function toast(message){el('toast').textContent=message;el('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el('toast').hidden=true;},4500);}
function canEdit(){return Boolean(state.env?.permissions.canEdit&&!state.stale&&!state.pending&&state.env.writesEnabled!==false);}
function canOperate(){return Boolean(state.env?.permissions.canOperate&&!state.stale&&!state.pending&&state.env.writesEnabled!==false);}
function clearRadio(){radio.requestSerial++;radio.snapshot=null;radio.loading=false;radio.error=null;radio.receivedAt=null;radio.knownIds=null;radio.newIds.clear();}
function radioFresh(){
  const age=radio.receivedAt===null?Infinity:Date.now()-radio.receivedAt;
  return Boolean(radio.snapshot?.configured&&radio.snapshot.connected&&!radio.snapshot.stale&&!radio.error&&age>=0&&age<=45000);
}
function sameCallsign(left,right){return /^\d{1,5}$/.test(String(left))&&/^\d{1,5}$/.test(String(right))&&Number(left)===Number(right);}
function radioMatchesTeam(user,team){return Boolean(user.category&&user.number&&user.category===team.dienst&&[(team.roepnaam),...(team.leden||[]).map(member=>member.roep)].some(number=>sameCallsign(number,user.number)));}
function radioAlreadyOnBoard(user){return Boolean(state.env&&activeTeams(state.env.board).some(team=>radioMatchesTeam(user,team)));}
function canImportRadioUser(user){return Boolean(user?.importable&&state.env?.categories.includes(user.category)&&/^\d{1,5}$/.test(String(user.number))&&Number(user.number)>0);}
function visibleRadioUser(user){
  return Boolean(user&&serviceForCategory(user.category).id!=='overige'&&user.name!=='Onbekende gebruiker');
}
function radioCrewOnBoard(crew){
  return activeTeams(state.env?.board).find(team=>crew.members.some(user=>radioMatchesTeam(user,team)))||null;
}
function canQuickAddRadioCrew(crew){
  const first=crew?.members?.[0];
  return Boolean(first&&canImportRadioUser(first)&&
    (crew.members.length===1||crew.paired)&&
    crew.members.every(user=>canImportRadioUser(user)&&user.category===first.category&&sameCallsign(user.number,first.number)));
}
function pendingRadioCrews(){
  if(!radioFresh()||!state.env)return [];
  const used=new Set();
  return groupRadioCrews(radio.snapshot.users).filter(crew=>{
    if(!crew.members.some(visibleRadioUser)||!matchesCategory(crew.category)||!crew.members.some(u=>matches(u.category,u.number,u.displayName,u.name))||radioCrewOnBoard(crew))return false;
    const key=crew.category+'|'+String(Number(crew.number));
    if(used.has(key))return false;
    used.add(key);
    return true;
  });
}
async function quickAddRadioCrew(id){
  if(!canEdit()||!radioFresh())return;
  const crew=groupRadioCrews(radio.snapshot.users).find(crew=>crew.members.some(u=>u.id===id));
  if(!crew||!canQuickAddRadioCrew(crew)||radioCrewOnBoard(crew))return;
  const memberNames=[...new Set(crew.members.map(u=>String(u.displayName||'').replace(/[<>\x00-\x1f\x7f]/g,'').trim()).filter(v=>v.length>1))];
  const combined=memberNames.join(' & ').slice(0,80).trim();
  const name=combined.length>=2?combined:('Radioploeg '+crew.category+'-'+crew.number).slice(0,80);
  await command('add-team',{dienst:crew.category,leden:[{naam:name,roep:String(crew.number)}]});
  toast(crew.category+'-'+crew.number+' staat nu op het dienstbord.');
}
function busyMap(board){
  const result=new Map();
  for(const incident of incidents(board).filter(item=>item.status==='actief'))for(const team of incident.ploegen||[]){
    if(!result.has(team.id))result.set(team.id,[]);
    result.get(team.id).push(incident);
  }
  return result;
}
async function request(path,options={}){
  const user=auth?.currentUser,epoch=authEpoch;
  if(!user)throw new Error('Meld je eerst aan met je portaalaccount.');
  const token=await user.getIdToken();
  if(epoch!==authEpoch||auth?.currentUser?.uid!==user.uid)throw Object.assign(new Error('Aanmeldsessie gewijzigd.'),{obsolete:true});
  const response=await fetch(path,{...options,headers:{Accept:'application/json',Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(15000)});
  const payload=await response.json().catch(()=>({}));
  if(epoch!==authEpoch||auth?.currentUser?.uid!==user.uid)throw Object.assign(new Error('Aanmeldsessie gewijzigd.'),{obsolete:true});
  if(!response.ok)throw Object.assign(new Error(payload.error||'Het dienstbord is momenteel niet beschikbaar.'),{status:response.status});
  return payload;
}
function acceptEnvelope(payload){
  if(!payload?.board||!Number.isSafeInteger(payload.board.revision)||payload.board.revision<0||!payload.permissions||!payload.viewer||!Array.isArray(payload.categories))throw new Error('Het dienstbord gaf een onvolledige respons.');
  if(state.env&&payload.board.revision<state.env.board.revision)return;
  state.env=payload;state.stale=false;state.lastSynced=Date.now();
}
async function refresh({quiet=false}={}){
  if(!auth?.currentUser||state.pending)return;
  const wasStale=state.stale;
  try{
    acceptEnvelope(await request('/api/to/board'));
    if(state.view==='archives'&&!state.archive)await loadArchives();
    render();
    if(!quiet||wasStale)showReadiness();
    if(state.view==='board'&&!radio.snapshot&&!radio.loading)void refreshRadio();
  }catch(error){
    if(error.obsolete)return;
    state.stale=true;
    if(error.status===401||error.status===403){state.env=null;state.archive=null;state.archives=null;clearRadio();closeDialog();}
    render();tell(error.message+(state.env?' De getoonde gegevens kunnen verouderd zijn. Vernieuw het bord voordat je wijzigingen maakt.':''),state.env?'warning':'error');
  }
}
async function refreshRadio(){
  if(!auth?.currentUser||!state.env||state.view!=='board'||document.hidden||radio.loading)return;
  const serial=++radio.requestSerial,epoch=authEpoch;
  radio.loading=true;renderRadio();
  try{
    const payload=await request('/api/to/radio');
    if(serial!==radio.requestSerial||epoch!==authEpoch||!state.env)return;
    if(typeof payload.configured!=='boolean'||typeof payload.connected!=='boolean'||typeof payload.stale!=='boolean'||!Array.isArray(payload.users))throw new Error('De radio gaf een onvolledige respons.');
    if(payload.connected&&!payload.stale){
      const next=new Set(payload.users.filter(visibleRadioUser).map(user=>user.id));
      if(radio.knownIds!==null)for(const id of next)if(!radio.knownIds.has(id))radio.newIds.add(id);
      for(const id of radio.newIds)if(!next.has(id))radio.newIds.delete(id);
      radio.knownIds=next;
    }
    radio.snapshot=payload;radio.error=null;radio.receivedAt=Date.now();
  }catch(error){
    if(error.obsolete||serial!==radio.requestSerial||epoch!==authEpoch)return;
    radio.error='De radioverbinding kon niet worden bijgewerkt. Je kunt ploegen en meldingen gewoon verder beheren.';
  }finally{
    if(serial===radio.requestSerial&&epoch===authEpoch){
      radio.loading=false;renderRadio();renderSummary();
      if(state.env&&state.view==='board'){el('board-content').innerHTML=renderBoard();updateButtons();}
    }
  }
}
function renderRadio(){
  const panel=el('radio-panel');
  panel.hidden=!state.env||state.view!=='board';
  if(panel.hidden){if(!state.env)panel.replaceChildren();return;}
  const snapshot=radio.snapshot,allUsers=snapshot?.users||[],fresh=radioFresh();
  const allCrews=groupRadioCrews(allUsers);
  const visibleCrews=allCrews.filter(crew=>crew.members.some(visibleRadioUser));
  const hiddenCount=allUsers.filter(user=>!visibleRadioUser(user)).length;
  const displayedCrews=visibleCrews.filter(crew=>matchesCategory(crew.category)&&
    crew.members.some(user=>matches(user.category,user.number,user.displayName,user.name)));
  const configured=snapshot?.configured,outdated=Boolean(snapshot?.stale||snapshot?.connected&&!fresh);
  const status=!snapshot?(radio.error?'Niet bereikbaar':'Verbinding maken'):!configured?'Nog niet gekoppeld':fresh?'Verbonden':outdated||radio.error?'Verouderde radio-informatie':'Niet verbonden';
  const color=fresh?'green':configured&&(outdated||radio.error)?'amber':'gray';
  const synced=snapshot?.fetchedAt?time(Date.parse(snapshot.fetchedAt)):null;
  let notice='';
  if(radio.error)notice=radio.error;
  else if(configured===false)notice='De radiokoppeling is nog niet ingesteld voor deze omgeving.';
  else if(outdated)notice=(snapshot.message||'Dit is de laatst ontvangen radiostand. De verbinding wordt opnieuw gecontroleerd.')+' Alleen ploegen op het dienstbord tellen mee zolang de radiogegevens niet actueel zijn.';
  else if(snapshot&&!snapshot.connected)notice=snapshot.message||'Er is momenteel geen verbinding met de radio.';
  const groups=groupByTOService(displayedCrews,crew=>crew.category);
  const userCard=crew=>{
    const members=crew.members,first=members[0],storedTeam=radioCrewOnBoard(crew),onBoard=Boolean(storedTeam);
    const importable=canQuickAddRadioCrew(crew);
    const justJoined=!onBoard&&members.some(user=>radio.newIds.has(user.id));
    let action=onBoard?'<span class="radio-on-board">Op dienstbord</span>':
      !importable?'<span class="radio-unrecognized" title="Controleer de bemanning en het roepnummer.">Controle nodig</span>':'';
    if(onBoard&&state.env.permissions.canEdit)
      action=`<button type="button" class="button button-small radio-remove" data-action="remove-team" data-id="${esc(storedTeam.id)}" data-write${!canEdit()?' disabled':''}>－ Uit dienst</button>`;
    else if(!onBoard&&importable&&state.env.permissions.canEdit)
      action=`<button type="button" class="button button-small radio-add" data-action="radio-quick-add" data-id="${esc(first.id)}" data-write${!fresh?' data-fixed-disabled="true"':''}${!fresh||!canEdit()?' disabled':''}>＋ Op bord</button>`;
    const recognized=serviceForCategory(crew.category).id!=='overige';
    const unit=recognized?unitBadge(crew.category,'unit-token-small'):'';
    const nbStatus=crew.radioUnavailable
      ?pill(fresh?'Niet beschikbaar · NB':'NB · laatste radiostand','red')
      :crew.paired?pill('Koppel','blue'):'';
    const channels=[...new Set(members.map(user=>user.channel===null||user.channel===undefined||user.channel===''?'Zonder kanaal':'Kanaal '+String(user.channel)))];
    const memberNames=members.map(user=>esc(user.displayName||user.name||'Onbekend radiolabel'));
    const display=crew.paired&&recognized
      ?esc(crew.category)+'-'+esc(crew.number)+'*'
      :esc(first.name||'Onbekend radiolabel');
    return `<div class="radio-user${crew.paired?' radio-crew-paired':''}${crew.radioUnavailable?' radio-crew-nb':''}${justJoined?' radio-just-joined':''}"${recognized?' data-category="'+esc(crew.category)+'"':''}${importable&&!onBoard&&fresh&&canEdit()?' draggable="true" data-radio-drag="'+esc(first.id)+'"':''}><div class="radio-user-copy"><div class="radio-user-name"><span class="radio-indicator${fresh?' online':''}" aria-hidden="true"></span>${unit}<span class="radio-display-name" title="${esc(first.name)}">${display}</span>${crew.paired?'<span class="radio-pair-icon" title="Koppeldienst: één ploeg">👥</span>':''}${justJoined?'<span class="radio-arrival-badge">NIEUW</span>':!onBoard?'<span class="radio-pending-badge">NOG OP TE NEMEN</span>':''}</div><small class="radio-user-channel">${recognized?esc(crew.category)+' · ':''}${channels.map(esc).join(' · ')}${crew.paired?' · '+members.length+' radiolid'+(members.length===1?'':'den'):''}</small>${crew.paired?'<div class="radio-crew-members">'+memberNames.map(name=>'<span>'+name+'</span>').join('')+'</div>':''}${nbStatus?'<div class="radio-crew-status">'+nbStatus+'</div>':''}</div>${action}</div>`;
  };
  panel.innerHTML=`<div class="radio-header"><div class="radio-heading"><span class="radio-symbol" aria-hidden="true">◉</span><div><h2 id="radio-title">Sonoran Radio</h2><p>Verbonden gebruikers · radiolabels</p></div>${pill(status,color)}</div><div class="radio-header-actions">${synced?`<span class="radio-last-sync">Ontvangen ${synced}</span>`:''}<button type="button" class="button button-small" data-action="radio-refresh"${radio.loading?' disabled':''}>${radio.loading?'Bijwerken…':'↻ Radio verversen'}</button></div></div>${notice?`<p class="radio-notice${radio.error||outdated?' warning':''}" role="status">${esc(notice)}</p>`:''}${snapshot&&configured?`<div class="radio-summary"><span><strong>${Number(snapshot.counts?.online)||allUsers.length}</strong> op radio</span><span><strong>${Number(snapshot.counts?.recognized)||0}</strong> herkende radiogebruikers</span>${hiddenCount?'<span>'+hiddenCount+' onbekende radiolabels verborgen</span>':''}<span>Automatisch elke 15 seconden bijgewerkt</span></div>`:''}${groups.length?`<div class="radio-channels">${groups.map(service=>`<section class="radio-channel radio-service" data-service="${esc(service.id)}" aria-labelledby="radio-service-${esc(service.id)}"><h3 id="radio-service-${esc(service.id)}">${esc(service.label)} <span>${service.items.length} ${service.items.length===1?'radio-eenheid':'radio-eenheden'}</span></h3><div class="radio-users">${service.items.slice().sort((a,b)=>compareRadioUsers(a.members[0],b.members[0])).map(userCard).join('')}</div></section>`).join('')}</div>`:fresh?`<p class="radio-empty">${allUsers.length?'Geen radioploegen voor deze selectie.':'Er zijn momenteel geen gebruikers met de radio verbonden.'}</p>`:!snapshot&&!radio.error?'<p class="radio-empty">De laatste radiostand wordt opgehaald…</p>':''}${configured&&allUsers.length?'<p class="radio-disclaimer">Herkende radioploegen tellen automatisch mee als beschikbaar. Gebruik ‘Op bord’ of sleep een nieuwe radioploeg naar het dienstbord om ze te beheren. ‘Uit dienst’ bewaart de historiek. Controleer de bemanning: een radiolabel bevestigt geen personeelsidentiteit.</p>':''}`;
  updateButtons();
}
function showReadiness(){
  const env=state.env;if(!env)return;
  if(!env.permissions.canOperate)tell('Je bekijkt het politiedienstbord met leesrechten. Een bevoegd kaderlid beheert de dienst.');
  else if(env.board.session&&!env.permissions.canEdit)tell('Je kijkt mee met '+env.board.session.to+'. Neem de dienst over om ploegen en meldingen te beheren.');
  else if(env.board.session)tell('Je beheert deze dienst. Wijzigingen worden gedeeld met de andere aangemelde collega’s.');
  else tell('Er loopt nog geen dienst. Start een sessie om ploegen en meldingen te beheren.');
}
async function command(type,data={},revision=state.env?.board.revision){
  if(state.pending)throw new Error('Wacht tot de vorige wijziging is opgeslagen.');
  if(state.stale)throw new Error('Vernieuw eerst het dienstbord; de verbinding is nog niet bevestigd.');
  state.pending=true;updateButtons();
  try{
    const payload=await request('/api/to/commands',{method:'POST',body:JSON.stringify({type,expectedRevision:revision,...data})});
    acceptEnvelope(payload);
    state.archives=null;
    render();showReadiness();
    return payload;
  }catch(error){
    if(error.status===409){
      try{acceptEnvelope(await request('/api/to/board'));render();}catch{state.stale=true;render();}
      throw new Error(error.message+' Je wijziging is niet opgeslagen. Het actuele bord is vernieuwd. Sluit dit venster en controleer de gegevens voordat je opnieuw probeert.');
    }
    if(error.status>=500||!error.status){state.stale=true;render();}
    throw error;
  }finally{state.pending=false;renderSummary();updateButtons();}
}
function updateButtons(){
  for(const control of document.querySelectorAll('[data-write]')){
    const action=control.dataset.action;
    control.disabled=control.dataset.fixedDisabled==='true'||state.pending||state.stale||(action==='start'||action==='takeover'?!canOperate():!canEdit());
  }
  const submit=dialog.querySelector('button[type="submit"]');if(submit)submit.disabled=state.pending||state.stale;
}
function render(){
  const env=state.env;
  el('workspace-content').hidden=!env;
  el('welcome').hidden=Boolean(env);
  el('connection').className='connection'+(env?(state.stale?' stale':' connected'):'');
  el('connection').innerHTML='<span></span>'+(env?(state.stale?'Verbinding onderbroken':'Gedeeld dienstbord'):'Aanmelding vereist');
  if(!env){renderRadio();return;}
  renderSummary();
  el('tab-board').classList.toggle('active',state.view==='board');
  el('tab-archives').classList.toggle('active',state.view==='archives');
  for(const [id,view]of [['tab-board','board'],['tab-archives','archives']]){if(state.view===view)el(id).setAttribute('aria-current','page');else el(id).removeAttribute('aria-current');}
  el('board-tools').hidden=state.view!=='board';
  el('updated-at').textContent=state.lastSynced?'Bijgewerkt om '+time(state.lastSynced):'';
  const select=el('category-filter'),previous=state.category;
  select.innerHTML='<option value="all">Alle hulpdiensten en categorieën</option>'+categoryOptions(env.categories,{services:true});
  select.value=env.categories.includes(previous)||groupByTOService(env.categories,category=>category).some(service=>previous==='service:'+service.id)?previous:'all';state.category=select.value;
  renderRadio();
  el('board-content').innerHTML=state.view==='archives'?renderArchives():renderBoard();
  updateButtons();
}
function renderSummary(){
  const env=state.env;if(!env)return;
  const board=env.board,fresh=radioFresh();
  const counts=summarizeTOCrews(board,{users:radio.snapshot?.users||[],fresh,categories:env.categories});
  const radioNote=fresh?counts.radioOnly+' via radio':radio.snapshot?.configured?'radio niet actueel':'geen radiotelling';
  const session=board.session;
  let actions='';
  if(env.permissions.canOperate){
    if(!session)actions=button('＋ Dienst starten','start',{primary:true,write:true});
    else if(env.permissions.canEdit)actions=button('Dienst afsluiten','close-session',{write:true});
    else actions=button('Dienst overnemen','takeover',{primary:true,write:true});
  }
  el('session-summary').innerHTML=`<article class="summary-card session"><div class="summary-label">TO VAN DIENST${session?pill('Lopende dienst','green'):''}</div><div class="summary-value">${esc(session?.to||'Geen lopende dienst')}</div><div class="summary-note">${session?'Sinds '+time(session.startedAt)+' · '+duration(session.startedAt)+' · '+(session.handovers||[]).length+' overname(s)':'Een gedeeld overzicht begint met een nieuwe sessie.'}</div>${actions?`<div class="summary-actions">${actions}</div>`:''}</article><article class="summary-card"><div class="summary-label">Ploegen in dienst<span class="counter-icon">▤</span></div><div class="summary-value">${counts.inService}</div><div class="summary-note">${counts.boardTeams} op dienstbord · ${radioNote}</div></article><article class="summary-card"><div class="summary-label">Beschikbaar<span class="counter-icon green">✓</span></div><div class="summary-value">${counts.available}</div><div class="summary-note">${counts.unavailable} bezet of niet beschikbaar${counts.radioOnly?' · '+counts.radioOnly+' via radio':''}</div></article><article class="summary-card"><div class="summary-label">Actieve meldingen<span class="counter-icon amber">!</span></div><div class="summary-value">${counts.activeIncidents}</div><div class="summary-note">${incidents(board).length-counts.activeIncidents} afgerond in deze dienst</div></article>`;
}
function renderBoard(){
  const board=state.env.board,teams=activeTeams(board),busy=busyMap(board),allIncidents=incidents(board),editable=canEdit();
  const selectedTeams=teams.filter(team=>matchesCategory(team.dienst)&&matches(team.dienst,team.roepnaam,...(team.leden||[]).map(member=>member.naam)));
  const teamMarkup=groupByTOService(selectedTeams,team=>team.dienst).map(service=>{
    const categories=[...new Set(service.items.map(team=>team.dienst))].sort(compareCategories);
    const sections=categories.map(category=>{
      const group=service.items.filter(team=>team.dienst===category).sort((a,b)=>String(a.roepnaam).localeCompare(String(b.roepnaam),'nl',{numeric:true}));
      return `<section class="category-section"><h4 class="category-heading category-identity">${unitBadge(category,'unit-token-small')}<strong>${esc(category)}</strong> <span>${group.length} ${group.length===1?'ploeg':'ploegen'}</span></h4><div class="team-grid">${group.map(team=>teamCard(team,busy.get(team.id)||[],editable)).join('')}</div></section>`;
    }).join('');
    return `<section class="service-team-section" data-service="${esc(service.id)}" aria-labelledby="board-service-${esc(service.id)}"><h3 class="service-heading" id="board-service-${esc(service.id)}">${esc(service.label)}<span>${service.items.length} ${service.items.length===1?'ploeg':'ploegen'}</span></h3>${sections}</section>`;
  }).join('');
  const filtered=allIncidents.filter(item=>(state.filter==='alle'||item.status===state.filter)&&matches(item.titel,item.postcode,item.omschrijving,incidentNumber(item.nr),...(item.ploegen||[]).map(team=>team.dienst+'-'+team.roep))).sort((a,b)=>(a.status===b.status?0:a.status==='actief'?-1:1)||b.nr-a.nr);
  const activeCount=allIncidents.filter(item=>item.status==='actief').length;
  const filter=(value,label,count)=>`<button type="button" data-action="filter-incidents" data-filter="${value}" class="${state.filter===value?'active':''}" aria-pressed="${state.filter===value}">${label} · ${count}</button>`;
  return `${!board.session?`<section class="no-session"><div><h2>Het bord is klaar voor een nieuwe dienst.</h2><p>Start een sessie om ploegen toe te voegen en meldingen te registreren. Afgesloten diensten blijven terug te vinden in het archief.</p></div>${state.env.permissions.canOperate?button('Dienst starten','start',{primary:true,write:true}):''}</section>`:''}<div class="board-layout"><section aria-labelledby="teams-title"><div class="panel-heading"><div><h2 id="teams-title">Ploegen op dienstbord</h2><p>${teams.length} ${teams.length===1?'ploeg':'ploegen'} · ${teams.filter(team=>team.koppel).length} koppelploeg(en)</p></div>${state.env.permissions.canEdit?button('＋ Ploeg toevoegen','add-team',{write:true}):''}</div>${teamMarkup||empty(state.query||state.category!=='all'?'Geen ploegen gevonden':'Nog geen ploegen op het dienstbord',state.query||state.category!=='all'?'Probeer een andere zoekterm of categorie.':'Voeg een ploeg met één of twee agenten toe zodra de dienst is gestart.')}</section><section aria-labelledby="incidents-title"><div class="panel-heading"><div><h2 id="incidents-title">Meldingen</h2><p>Van oproep tot afronding, met een gedeeld logboek</p></div>${state.env.permissions.canEdit?button('＋ Nieuwe melding','create-incident',{primary:true,write:true}):''}</div><div class="incident-filters" role="group" aria-label="Meldingenfilter">${filter('actief','Actief',activeCount)}${filter('niet-actief','Afgerond',allIncidents.length-activeCount)}${filter('alle','Alle',allIncidents.length)}</div><div class="incident-list">${filtered.map(incidentCard).join('')||empty('Geen meldingen in dit overzicht',state.query?'Probeer een andere zoekterm.':'Nieuwe oproepen verschijnen hier. Afgeronde meldingen blijven binnen de dienst bewaard.')}</div></section></div>`;
}
function teamCard(team,busy,editable){
  const fresh=radioFresh(),radioMembers=fresh?(radio.snapshot.users||[]).filter(user=>radioMatchesTeam(user,team)):[];
  const nbOnRadio=fresh&&radioNBForTeam(team,radioMembers);
  const paired=team.koppel||radioMembers.some(user=>user.paired===true);
  const status=nbOnRadio?pill('Niet beschikbaar · NB','red')+
    (busy.length?pill('Op '+incidentNumber(busy[0].nr),'amber'):''):
    busy.length?pill('Op '+incidentNumber(busy[0].nr)+(busy.length>1?' +'+(busy.length-1):''),'amber'):
    team.available===false?pill('Niet beschikbaar','red'):pill('Beschikbaar','green');
  const onRadio=radioMembers.length>0;
  const identity=teamVisual(team.dienst);
  const stateClass=nbOnRadio||team.available===false?'on-pause':busy.length?'on-incident':'ready';
  return `<article class="team-card" data-service="${esc(identity.serviceId)}" data-availability="${stateClass}" style="--unit-hue:${identity.hue}"><div class="team-card-body"><div class="team-top">${status}${onRadio?'<span class="radio-team-badge">◉ Radio online</span>':''}${paired?'<span class="pair-label">👥 KOPPEL</span>':''}</div><div class="team-identity">${unitBadge(team.dienst,'unit-token-hero')}<div class="team-identity-copy"><span class="team-category-name">${esc(team.dienst)}</span><div class="callsign"><strong>${esc(team.roepnaam)}</strong></div></div></div><div class="crew-list">${(team.leden||[]).map(member=>`<div class="crew-line"><span>${esc(member.naam)}</span><span class="mono">${esc(member.roep)}</span></div>`).join('')}</div></div><div class="team-card-foot"><span class="team-since">In dienst sinds ${time(team.createdAt)}</span>${state.env.permissions.canEdit?`<div class="team-actions"><button type="button" class="text-button" data-action="toggle-team" data-id="${esc(team.id)}" data-write${busy.length||nbOnRadio?' data-fixed-disabled="true"':''}${!editable||busy.length||nbOnRadio?' disabled':''}>${nbOnRadio?'NB via radio':team.available===false?'Beschikbaar':'Pauzeren'}</button><button type="button" class="text-button danger" data-action="remove-team" data-id="${esc(team.id)}" data-write${!editable?' disabled':''}>Uit dienst</button></div>`:''}</div></article>`;
}
function incidentCard(incident){
  return `<button type="button" class="incident-card" data-action="open-incident" data-id="${esc(incident.id)}"><span class="incident-meta"><span class="incident-number mono">${incidentNumber(incident.nr)}</span>${pill(incident.status==='actief'?'Actief':'Afgerond',incident.status==='actief'?'amber':'gray')}<span class="incident-time mono">${time(incident.createdAt)}</span></span><strong class="incident-title">${esc(incident.titel)}</strong><span class="incident-description">${esc(String(incident.omschrijving||'Geen aanvullende omschrijving.').slice(0,150))}${String(incident.omschrijving||'').length>150?'…':''}</span><span class="incident-footer"><span class="postal mono">PC ${esc(incident.postcode)}</span>${(incident.ploegen||[]).map(team=>`<span class="team-chip" data-unit-service="${esc(teamVisual(team.dienst).serviceId)}" style="--unit-hue:${teamVisual(team.dienst).hue}">${unitBadge(team.dienst,'unit-token-micro')}${esc(team.dienst)}-${esc(team.roep)}</span>`).join('')||'<span class="unassigned">Nog geen ploeg gekoppeld</span>'}</span></button>`;
}
async function loadArchives(){state.archives=await request('/api/to/archives');}
function renderArchives(){
  if(state.archive)return renderArchiveDetail(state.archive);
  if(!state.archives)return empty('Dienstarchief ophalen…','Een moment geduld.');
  const archives=state.archives.archives||[];
  return `<div class="panel-heading"><div><h2>Afgesloten diensten</h2><p>Een blijvende momentopname van ploegen, meldingen en overdrachten.</p></div></div>${state.archives.limited?'<div class="feedback warning">Je ziet een begrensd overzicht van de meest recente diensten.</div>':''}<div class="archive-list">${archives.map(archive=>`<button type="button" class="archive-row" data-action="open-archive" data-id="${esc(archive.id)}"><span class="archive-icon" aria-hidden="true">▤</span><span class="archive-copy"><strong>${esc(archive.to||'TO-dienst')} · ${date(archive.startedAt)}</strong><small>${time(archive.startedAt)}–${time(archive.closedAt)} · afgesloten ${date(archive.closedAt)}</small></span><span class="archive-counts">${Number(archive.teamCount)||0} ploegen · ${Number(archive.incidentCount)||0} meldingen →</span></button>`).join('')||empty('Nog geen afgesloten diensten','Na het afsluiten wordt een dienst met zijn ploegen en meldingen hier bewaard.')}</div>`;
}
function renderArchiveDetail(archive){
  const session=archive.session||{},teams=rows(archive.ploegen),calls=rows(archive.meldingen);
  return `<div class="archive-header"><div><button type="button" class="text-button" data-action="back-archives">← Alle diensten</button><h2>${esc(session.to||archive.to||'Afgesloten dienst')}${pill('Archief','gray')}</h2><p>${date(session.startedAt||archive.startedAt)} · ${time(session.startedAt||archive.startedAt)} tot ${time(archive.closedAt)}<br>${teams.length} ploegen · ${calls.length} meldingen · ${(session.handovers||[]).length} overname(s)</p></div>${button('↓ Download archief','export-archive')}</div><div class="archive-overview"><section><h3 class="category-heading">PLOEGEN EN OVERDRACHTEN</h3>${teams.map(team=>`<article class="archive-detail-card"><h3>${esc(team.dienst)}-${esc(team.roepnaam||team.roep)}</h3><p>${(team.leden||[]).map(member=>esc(member.naam)+' · '+esc(member.roep)).join('<br>')||'Geen bemanning opgenomen.'}</p><span class="mono muted">${team.endedAt?'Uit dienst om '+time(team.endedAt):'In dienst bij afsluiten'}</span></article>`).join('')||empty('Geen ploegen','Deze dienst bevat geen geregistreerde ploegen.')}${(session.handovers||[]).length?`<article class="archive-detail-card"><h3>Overdrachten</h3><ol class="log-list">${session.handovers.map(item=>`<li><span class="mono">${time(item.at)}</span><span>${esc(item.from)} → ${esc(item.to)}${item.reason?'<br>'+esc(item.reason):''}</span></li>`).join('')}</ol></article>`:''}</section><section><h3 class="category-heading">MELDINGEN</h3>${calls.sort((a,b)=>a.nr-b.nr).map(incident=>`<article class="archive-detail-card"><h3>${incidentNumber(incident.nr)} · ${esc(incident.titel)}</h3><div class="dialog-meta"><span class="postal mono">PC ${esc(incident.postcode)}</span>${pill(incident.status==='actief'?'Actief':'Afgerond',incident.status==='actief'?'amber':'gray')}</div><p>${esc(incident.omschrijving||'Geen aanvullende omschrijving.')}</p><div class="incident-footer">${(incident.ploegen||[]).map(team=>`<span class="team-chip" data-unit-service="${esc(teamVisual(team.dienst).serviceId)}" style="--unit-hue:${teamVisual(team.dienst).hue}">${unitBadge(team.dienst,'unit-token-micro')}${esc(team.dienst)}-${esc(team.roep)}</span>`).join('')}</div>${incident.log?.length?`<div class="detail-section"><ol class="log-list">${incident.log.map(item=>`<li><span class="mono">${time(item.t)}</span><span>${esc(item.txt)}${item.by?'<br><strong>'+esc(operatorName(item.by,archive.session))+'</strong>':''}</span></li>`).join('')}</ol></div>`:''}</article>`).join('')||empty('Geen meldingen','Er waren geen meldingen in deze dienst.')}</section></div>`;
}
function openDialog(title,body,{form='',id='',submit='Opslaan',danger=false,footer='',revision=state.env?.board.revision}={}){
  dialog.dataset.revision=String(revision);
  dialog.innerHTML=`${form?`<form id="to-form" data-form="${form}"${id?` data-id="${esc(id)}"`:''}>`:''}<div class="dialog-header"><div><div class="eyebrow">BELGIËPD · TO DIENSTBORD</div><h2 id="dialog-title">${esc(title)}</h2></div><button type="button" class="dialog-close" data-action="close-dialog" aria-label="Venster sluiten">×</button></div><div class="dialog-body">${body}<p id="form-error" class="form-error" role="alert" hidden></p></div><div class="dialog-footer">${footer||`${button('Annuleren','close-dialog')}${form?`<button type="submit" class="button ${danger?'button-danger':'button-primary'}">${esc(submit)}</button>`:''}`}</div>${form?'</form>':''}`;
  if(!dialog.open)dialog.showModal();
  dialog.querySelector('[autofocus]')?.focus();
  updateButtons();
}
function closeDialog(){if(dialog.open)dialog.close();dialog.innerHTML='';delete dialog.dataset.incidentId;}
function formError(message){const target=el('form-error');if(target){target.textContent=message;target.hidden=false;}else tell(message,'error');}
function defaultName(){return String(auth?.currentUser?.displayName||'').slice(0,60);}
function startDialog(takeover=false){
  const session=state.env.board.session;
  openDialog(takeover?'Dienst overnemen':'Nieuwe dienst starten',`<p class="form-note">${takeover?'Je neemt het dienstbord over van '+esc(session?.to||'de huidige TO')+'. Deze overname blijft zichtbaar in de diensthistoriek.':'Je wordt de TO van deze dienst. Collega’s met toegang kunnen het bord bekijken en de dienst later overnemen.'}</p><label class="field"><span>Jouw naam op het dienstbord</span><input class="input" name="displayName" maxlength="80" minlength="2" value="${esc(defaultName())}" placeholder="Voor- en achternaam" required autofocus></label>${takeover?'<label class="field"><span>Reden van overname</span><textarea class="input" name="reason" minlength="8" maxlength="300" placeholder="Bijvoorbeeld: aflossing van de lopende dienst" required></textarea></label>':''}`,{form:takeover?'takeover':'start',submit:takeover?'Dienst overnemen':'Dienst starten'});
}
function teamDialog(prefill=null){
  openDialog('Ploeg toevoegen',`<label class="field"><span>Categorie</span><select class="input" name="dienst" id="team-category" required autofocus>${categoryOptions(state.env.categories)}</select></label><fieldset class="form-group"><legend>AGENT 1</legend><div class="form-grid"><label class="field"><span>Naam</span><input class="input" name="naam1" minlength="2" maxlength="80" required placeholder="Naam agent"></label><label class="field"><span>Roepnummer</span><input class="input mono" name="roep1" inputmode="numeric" pattern="[0-9]{1,5}" maxlength="5" required placeholder="620"></label></div></fieldset><label class="form-checkbox"><input type="checkbox" name="koppel" id="team-paired">Koppelrijden met een tweede agent</label><fieldset class="form-group" id="second-agent" hidden><legend>AGENT 2</legend><div class="form-grid"><label class="field"><span>Naam</span><input class="input" name="naam2" minlength="2" maxlength="80" placeholder="Naam agent"></label><label class="field"><span>Roepnummer</span><input class="input mono" name="roep2" inputmode="numeric" pattern="[0-9]{1,5}" maxlength="5" placeholder="640"></label></div></fieldset><div class="preview">Ploegnaam<strong id="team-preview">Vul een roepnummer in</strong></div><p class="form-note" style="margin-top:12px;margin-bottom:0">Bij koppelrijden wordt het hoogste roepnummer de ploegnaam.</p>`,{form:'add-team',submit:'Ploeg toevoegen'});
  if(prefill){
    const form=el('to-form');
    form.elements.dienst.value=prefill.category;
    form.elements.roep1.value=String(prefill.number);
    form.elements.naam1.value=String(prefill.displayName||'').trim().slice(0,80);
    const note=document.createElement('p');note.className='form-note';note.textContent='Deze suggestie komt van een radiolabel. Controleer naam en roepnummer; de radio bevestigt geen personeelsidentiteit.';
    form.querySelector('.dialog-body').prepend(note);
    previewTeam();form.elements.naam1.focus();
  }
}
function incidentForm(id=''){
  const incident=state.env.board.meldingen[id];
  openDialog(incident?incidentNumber(incident.nr)+' bewerken':'Nieuwe melding',`<div class="form-grid" style="margin-bottom:17px"><label class="field"><span>Postcode</span><input class="input mono" name="postcode" inputmode="numeric" pattern="[0-9]{1,8}" maxlength="8" value="${esc(incident?.postcode||'')}" required autofocus placeholder="7042"></label><label class="field"><span>Titel</span><input class="input" name="titel" maxlength="80" value="${esc(incident?.titel||'')}" required placeholder="Bijvoorbeeld: winkeldiefstal"></label></div><label class="field"><span>Omschrijving</span><textarea class="input" name="omschrijving" maxlength="2000" placeholder="Relevante informatie voor de ingezette ploegen">${esc(incident?.omschrijving||'')}</textarea></label><p class="form-note">Na het aanmaken kun je ploegen koppelen. Wijzigingen blijven zichtbaar in het meldingslogboek.</p>`,{form:incident?'update-incident':'create-incident',id,submit:incident?'Wijzigingen opslaan':'Melding aanmaken'});
}
function openIncident(id){
  const incident=state.env?.board.meldingen[id];if(!incident)return;
  const editable=canEdit(),attached=new Set((incident.ploegen||[]).map(team=>team.id)),teams=activeTeams(state.env.board),busy=busyMap(state.env.board);
  const current=incident.ploegen||[];
  const body=`<div class="dialog-meta">${pill(incident.status==='actief'?'Actief':'Afgerond',incident.status==='actief'?'amber':'gray')}<span class="postal mono">PC ${esc(incident.postcode)}</span><span class="mono muted" style="font-size:10px">${time(incident.createdAt)}</span></div><p class="detail-description">${esc(incident.omschrijving||'Geen aanvullende omschrijving.')}</p>${state.env.permissions.canEdit?`<div class="detail-actions">${button(incident.status==='actief'?'✓ Melding afronden':'Melding heropenen','incident-status',{id,write:true,primary:incident.status==='actief'})}${button('Bewerken','update-incident',{id,write:true})}</div>`:''}<section class="detail-section"><h3>Gekoppelde ploegen · ${current.length}</h3>${current.map(team=>`<div class="assignment"><div><strong>${esc(team.dienst)}-${esc(team.roep)}</strong><small>${state.env.board.ploegen[team.id]?.endedAt?'Uit dienst':'In deze melding'}</small></div>${state.env.permissions.canEdit?button('Ontkoppelen','detach-team',{id,teamId:team.id,small:true,write:true,disabled:!editable}):''}</div>`).join('')||'<p class="form-note">Er is nog geen ploeg aan deze melding gekoppeld.</p>'}</section>${state.env.permissions.canEdit&&incident.status==='actief'?`<section class="detail-section"><h3>Ploeg toevoegen</h3>${teams.filter(team=>!attached.has(team.id)).map(team=>`<div class="assignment"><div><strong>${esc(team.dienst)}-${esc(team.roepnaam)}</strong><small>${esc((team.leden||[]).map(member=>member.naam).join(' & '))}</small></div><div class="assignment-actions">${busy.has(team.id)?pill('Op melding','amber'):team.available===false?pill('Gepauzeerd','gray'):pill('Vrij','green')}${button('Koppelen','attach-team',{id,teamId:team.id,small:true,write:true,disabled:!editable})}</div></div>`).join('')||'<p class="form-note">Alle beschikbare ploegen zijn al gekoppeld.</p>'}</section>`:''}<section class="detail-section"><h3>Meldingslogboek</h3><ol class="log-list">${(incident.log||[]).slice().reverse().map(item=>`<li><span class="mono">${time(item.t)}</span><span>${esc(item.txt)}${item.by?'<br><strong>'+esc(operatorName(item.by))+'</strong>':''}</span></li>`).join('')||'<li><span></span><span>Nog geen logregels.</span></li>'}</ol></section>`;
  openDialog(incidentNumber(incident.nr)+' · '+incident.titel,body,{footer:button('Sluiten','close-dialog')});dialog.dataset.incidentId=id;
}
function previewTeam(){
  const form=el('to-form');if(form?.dataset.form!=='add-team')return;
  const paired=form.elements.koppel.checked;
  el('second-agent').hidden=!paired;
  form.elements.naam2.required=paired;form.elements.roep2.required=paired;
  const values=[form.elements.roep1.value,...(paired?[form.elements.roep2.value]:[])].filter(value=>/^\d{1,5}$/.test(value));
  const highest=values.reduce((previous,value)=>Number(value)>Number(previous)?value:previous,values[0]||'');
  el('team-preview').textContent=highest?form.elements.dienst.value+'-'+highest:'Vul een roepnummer in';
}
function download(filename,payload){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function closeSessionDialog(){
  const count=incidents(state.env.board).filter(item=>item.status==='actief').length;
  openDialog('Dienst afsluiten',`<p class="form-note">De huidige ploegen, meldingen en overdrachten worden samen bewaard in het dienstarchief. Daarna kan een nieuwe dienst starten.</p>${count?`<div class="feedback warning">Er ${count===1?'is nog één actieve melding':'zijn nog '+count+' actieve meldingen'}. Rond ${count===1?'deze melding':'deze meldingen'} eerst af om de dienst te sluiten.</div>`:'<p class="form-note">Alle meldingen zijn afgerond. Het archief blijft beschikbaar voor bevoegde collega’s.</p>'}`,count?{footer:button('Terug naar het bord','close-dialog')}:{form:'close-session',submit:'Afsluiten en archiveren',danger:true});
}

document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const action=target.dataset.action,id=target.dataset.id;
  try{
    switch(action){
      case 'refresh':await refresh();break;
      case 'view-board':state.view='board';state.archive=null;render();void refreshRadio();break;
      case 'view-archives':state.view='archives';state.archive=null;render();await loadArchives();render();break;
      case 'back-archives':state.archive=null;render();if(!state.archives){await loadArchives();render();}break;
      case 'open-archive':{const result=await request('/api/to/archives/'+encodeURIComponent(id));state.archive=result.archive;render();break;}
      case 'export-board':download('belgiepd-to-dienst-'+new Date().toISOString().slice(0,10)+'.json',{format:'belgiepd-to-board/v1',exportedAt:new Date().toISOString(),board:state.env.board});toast('De dienst is gedownload als JSON.');break;
      case 'export-archive':download('belgiepd-to-archief-'+state.archive.id+'.json',{format:'belgiepd-to-archive/v1',archive:state.archive});break;
      case 'filter-incidents':state.filter=target.dataset.filter;render();break;
      case 'start':if(canOperate())startDialog();break;
      case 'takeover':if(canOperate())startDialog(true);break;
      case 'close-session':if(canEdit())closeSessionDialog();break;
      case 'add-team':if(canEdit())teamDialog();break;
      case 'radio-refresh':await refreshRadio();break;
      case 'radio-add-team':{
        if(!canEdit()||!radioFresh())break;
        const user=radio.snapshot.users.find(item=>String(item.id)===id);
        if(user&&canImportRadioUser(user)&&!radioAlreadyOnBoard(user))teamDialog(user);
        break;
      }
      case 'remove-team':{
        if(!canEdit())break;
        const team=state.env.board.ploegen[id];
        openDialog('Ploeg uit dienst halen',`<p class="form-note">Wil je ${esc(team.dienst)}-${esc(team.roepnaam)} uit dienst halen? De ploeg blijft bewaard in de historiek van deze dienst.</p>`,{form:'remove-team',id,submit:'Uit dienst halen',danger:true});break;
      }
      case 'toggle-team':if(canEdit()){const team=state.env.board.ploegen[id];if(busyMap(state.env.board).has(id)){toast('Deze ploeg is aan een actieve melding gekoppeld.');break;}await command('toggle-team',{id,available:team.available===false});toast('Beschikbaarheid bijgewerkt.');}break;
      case 'create-incident':if(canEdit())incidentForm();break;
      case 'update-incident':if(canEdit())incidentForm(id);break;
      case 'open-incident':openIncident(id);break;
      case 'incident-status':{
        if(!canEdit())break;
        const incident=state.env.board.meldingen[id],revision=Number(dialog.dataset.revision);
        await command('incident-status',{id,status:incident.status==='actief'?'niet-actief':'actief'},revision);openIncident(id);break;
      }
      case 'attach-team':case 'detach-team':if(canEdit()){await command(action,{id,teamId:target.dataset.teamId},Number(dialog.dataset.revision));openIncident(id);}break;
      case 'close-dialog':closeDialog();break;
    }
  }catch(error){if(error.obsolete)return;if(dialog.open)formError(error.message);else tell(error.message,'error');}
});
dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});
dialog.addEventListener('close',()=>{delete dialog.dataset.incidentId;});
dialog.addEventListener('input',event=>{previewTeam();if(el('form-error'))el('form-error').hidden=true;});
dialog.addEventListener('change',previewTeam);
dialog.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;if(form.id!=='to-form'||state.pending)return;
  const type=form.dataset.form,id=form.dataset.id,fields=form.elements,revision=Number(dialog.dataset.revision);
  let data={};
  if(type==='start'||type==='takeover')data={displayName:fields.displayName.value.trim(),...(type==='takeover'?{reason:fields.reason.value.trim()}:{})};
  if(type==='add-team')data={dienst:fields.dienst.value,leden:[{naam:fields.naam1.value.trim(),roep:fields.roep1.value.trim()},...(fields.koppel.checked?[{naam:fields.naam2.value.trim(),roep:fields.roep2.value.trim()}]:[])]};
  if(type==='create-incident'||type==='update-incident')data={...(id?{id}:{}),postcode:fields.postcode.value.trim(),titel:fields.titel.value.trim(),omschrijving:fields.omschrijving.value.trim()};
  if(type==='remove-team')data={id};
  try{
    const result=await command(type,data,revision);
    closeDialog();
    if(type==='create-incident'){
      state.filter='actief';render();
      const created=incidents(result.board).sort((a,b)=>b.nr-a.nr)[0];if(created)openIncident(created.id);
    }else if(type==='update-incident')openIncident(id);
    else toast(type==='close-session'?'Dienst afgesloten en gearchiveerd.':type==='add-team'?'Ploeg toegevoegd.':type==='remove-team'?'Ploeg uit dienst gehaald.':type==='takeover'?'Je hebt de dienst overgenomen.':'Dienst gestart.');
  }catch(error){if(!error.obsolete)formError(error.message);}
});
el('board-search').addEventListener('input',event=>{state.query=normalize(event.target.value.trim());render();});
el('category-filter').addEventListener('change',event=>{state.category=event.target.value;render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh({quiet:true});void refreshRadio();}});
setInterval(()=>{if(!document.hidden&&auth?.currentUser)refresh({quiet:true});},12000);
setInterval(()=>{if(!document.hidden&&auth?.currentUser&&state.view==='board')void refreshRadio();},15000);
setInterval(()=>{if(state.env){renderRadio();renderSummary();updateButtons();}},15000);

async function init(){
  try{
    const response=await fetch('/api/client-config',{cache:'no-store',signal:AbortSignal.timeout(10000)}),config=await response.json();
    if(!response.ok||!config.enabled){el('login').textContent='Aanmelden niet beschikbaar';tell('De portaal-aanmelding is nog niet ingesteld voor deze omgeving. Het gedeelde dienstbord wordt beschikbaar zodra de bestaande Firebase-configuratie is gekoppeld.','warning');return;}
    const appModule=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
    const authModule=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    const app=appModule.getApps().length?appModule.getApp():appModule.initializeApp(config.firebaseConfig);
    auth=authModule.getAuth(app);
    setupPortalLogin({button:el('login'),auth,authModule,config,onError:error=>tell('Aanmelden mislukt: '+error.message,'error')});
    el('login').disabled=false;
    authModule.onAuthStateChanged(auth,async user=>{
      authEpoch++;state.env=null;state.archives=null;state.archive=null;state.stale=true;state.pending=false;clearRadio();closeDialog();render();
      if(user){tell('Je toegang tot het politiedienstbord wordt gecontroleerd…');await refresh();}
      else tell('Meld je aan met je portaalaccount. Er worden pas daarna dienstgegevens geladen.');
    });
  }catch(error){el('login').textContent='Aanmelden niet beschikbaar';el('login').disabled=true;tell('De aanmelding kon niet worden geladen. Controleer je verbinding en vernieuw de pagina.','error');}
}
init();
