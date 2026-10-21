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
const displayCategory=category=>category==='ZW'?'ZW · Ziekenwagen':category;
// Temporary roster numbers can appear from live radio or manual TO entry,
// without an existing permanent personnel record.
const temporaryPoliceCall=(category,number)=>serviceForCategory(category).id==='politie'&&
  typeof number==='string'&&/^\d{1,5}$/.test(number)&&
  (Number(number)>=100&&Number(number)<=199);
// 008 is Belga's administrative callsign, not an aspirant or temporary unit.
// This visual label NEVER grants privileges: the server checks the account role.
const managementPoliceCall=(category,number)=>serviceForCategory(category).id==='politie'&&number==='008';
const policeRoleBadge=(category,number)=>managementPoliceCall(category,number)
  ?'<span class="management-call-badge" title="Belga · serverbestuurder (informatief, geen rechten)">BELGA · BEHEER</span>'
  :temporaryPoliceCall(category,number)?'<span class="temporary-call-badge">TIJDELIJK</span>':'';
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
const state={env:null,stale:true,pending:false,view:'board',query:'',category:'all',filter:'actief',showMoreIncidentPresets:false,shortcuts:{revision:0,items:{}},shortcutsError:null,archives:null,archive:null,lastSynced:null,teamView:'compact',collapsedBoardGroups:new Set(),pendingCollapsed:false,openCrewMenus:new Set()};
const radio={snapshot:null,loading:false,error:null,receivedAt:null,requestSerial:0,knownIds:null,newIds:new Set()};
const INCIDENT_PRESETS=Object.freeze(['ANPR','AGRESSIE','VKO','BRAND','TAKELING','DIEFSTAL','VERDACHTE SITUATIE','MEDISCHE BIJSTAND']);
const INCIDENT_EXTRA_PRESETS=Object.freeze(['OVERLAST','WONINGINBRAAK','VECHTPARTIJ','VERMIST PERSOON','ACHTERVOLGING','VERDACHT VOERTUIG','VERKEERSHINDER','BEROVING']);
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
function sameCallsign(left,right){return (String(left)==='HARTS'&&String(right)==='HARTS')||(/^\d{1,5}$/.test(String(left))&&/^\d{1,5}$/.test(String(right))&&Number(left)===Number(right));}
function radioMatchesTeam(user,team){return Boolean(user.category&&user.number&&user.category===team.dienst&&[(team.roepnaam),...(team.leden||[]).map(member=>member.roep)].some(number=>sameCallsign(number,user.number)));}
function radioAlreadyOnBoard(user){return Boolean(state.env&&activeTeams(state.env.board).some(team=>radioMatchesTeam(user,team)));}
function canImportRadioUser(user){
  const value=String(user?.number||'');
  const temporaryPoliceNumber=serviceForCategory(user?.category).id==='politie'&&/^1\d{2}$/.test(value)&&Number(value)>=101;
  return Boolean(user&&state.env?.categories.includes(user.category)&&/^\d{1,5}$/.test(value)&&Number(value)>0&&(user.importable||temporaryPoliceNumber));
}
function visibleRadioUser(user){
  return Boolean(user&&serviceForCategory(user.category).id!=='overige'&&user.name!=='Onbekende gebruiker');
}
function radioCrewOnBoard(crew){
  return activeTeams(state.env?.board).find(team=>crew.members.some(user=>radioMatchesTeam(user,team)))||null;
}
function canQuickAddRadioCrew(crew){
  const members=crew?.members||[],first=members[0];
  if(!first||!state.env?.categories.includes(crew.category)||crew.category==='OPLEIDING')return false;
  if(!(crew.category==='HARTS'&&crew.number==='HARTS')&&(!/^\d{1,5}$/.test(String(crew.number))||Number(crew.number)<=0))return false;
  // A starred callsign represents one unit, even when Sonoran marks an
  // individual duplicate label as non-importable. Never add its members
  // independently; require every member to carry the same valid unit.
  if(!crew.paired&&members.length!==1)return false;
  if(!members.every(user=>user.category===crew.category&&sameCallsign(user.number,crew.number)&&visibleRadioUser(user)))return false;
  // Temporary police units may share a numeric radio callsign before Sonoran
  // supplies an explicit paired flag. The board still stores only one team per
  // category and callsign, and the original identities remain unmodified.
  const temporaryPolice=serviceForCategory(crew.category).id==='politie'&&
    Number(crew.number)>=101&&Number(crew.number)<=199;
  return (crew.category==='HARTS'&&crew.number==='HARTS')||temporaryPolice||members.some(user=>canImportRadioUser(user))||
    (crew.paired&&members.some(user=>user.paired===true));
}
function pendingRadioCrews(){
  if(!radioFresh()||!state.env)return [];
  const used=new Set();
  return groupRadioCrews(radio.snapshot.users).filter(crew=>{
    if(!crew.members.some(visibleRadioUser)||!matchesCategory(crew.category)||!crew.members.some(u=>matches(u.category,u.number,u.displayName,u.name))||radioCrewOnBoard(crew))return false;
    const key=crew.category+'|'+(crew.number==='HARTS'?'HARTS':String(Number(crew.number)));
    if(used.has(key))return false;
    used.add(key);
    return true;
  });
}
async function quickAddRadioCrew(id){
  if(!canEdit()||!radioFresh())return;
  const crew=groupRadioCrews(radio.snapshot.users).find(crew=>crew.members.some(u=>u.id===id));
  if(!crew||!canQuickAddRadioCrew(crew)||radioCrewOnBoard(crew))return;
  const memberNames=[...new Set(crew.members.map(u=>String(u.portalAlias||u.displayName||'').replace(/[<>\x00-\x1f\x7f]/g,'').trim()).filter(v=>v.length>1))];
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
async function refreshShortcuts(){
  if(!auth?.currentUser||!state.env)return;
  try{
    const response=await request('/api/to/incident-shortcuts');
    if(!Number.isSafeInteger(response.revision)||!response.items||Array.isArray(response.items))throw new Error('Ongeldige sneltoetsrespons');
    if(response.revision>=state.shortcuts.revision)state.shortcuts=response;
    state.shortcutsError=null;
  }catch(error){
    if(error.obsolete)return;
    state.shortcutsError='Opgeslagen sneltoetsen konden niet worden bijgewerkt.';
  }
}
async function changeShortcut(action,data={}){
  if(!canEdit())throw new Error('Alleen de huidige TO kan meldingssneltoetsen wijzigen.');
  state.pending=true;updateButtons();
  try{
    const response=await request('/api/to/incident-shortcuts',{
      method:'POST',body:JSON.stringify({action,expectedRevision:state.shortcuts.revision,...data})
    });
    if(!Number.isSafeInteger(response.revision)||!response.items)throw new Error('Ongeldige sneltoetsrespons');
    state.shortcuts=response;state.shortcutsError=null;
  }catch(error){
    if(error.status===409){await refreshShortcuts();throw new Error(error.message+' De actuele sneltoetsen zijn opnieuw opgehaald.');}
    throw error;
  }finally{state.pending=false;render();}
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
    await refreshShortcuts();
    if(state.view==='archives'&&!state.archive)await loadArchives();
    render();
    if(!quiet||wasStale)showReadiness();
    if(state.view==='board'&&!radio.snapshot&&!radio.loading)void refreshRadio();
  }catch(error){
    if(error.obsolete)return;
    state.stale=true;
    if(error.status===401||error.status===403){state.env=null;state.archive=null;state.archives=null;state.shortcuts={revision:0,items:{}};state.shortcutsError=null;clearRadio();closeDialog();}
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
  const missingChannelStatus=Math.max(0,Number(snapshot?.channelStatusUnknown||0));
  const withoutChannel=Math.max(0,Number(snapshot?.notInChannel||0));
  const displayedCrews=visibleCrews.filter(crew=>matchesCategory(crew.category)&&
    crew.members.some(user=>matches(user.category,user.number,user.portalAlias,user.displayName,user.name)));
  const configured=snapshot?.configured,outdated=Boolean(snapshot?.stale||snapshot?.connected&&!fresh);
  const status=!snapshot?(radio.error?'Niet bereikbaar':'Verbinding maken'):!configured?'Nog niet gekoppeld':fresh?'Verbonden':outdated||radio.error?'Verouderde radio-informatie':'Niet verbonden';
  const color=fresh?'green':configured&&(outdated||radio.error)?'amber':'gray';
  const synced=snapshot?.fetchedAt?time(Date.parse(snapshot.fetchedAt)):null;
  let notice='';
  if(radio.error)notice=radio.error;
  else if(configured===false)notice='De radiokoppeling is nog niet ingesteld voor deze omgeving.';
  else if(outdated)notice=(snapshot.message||'Dit is de laatst ontvangen radiostand. De verbinding wordt opnieuw gecontroleerd.')+' Alleen ploegen op het dienstbord tellen mee zolang de radiogegevens niet actueel zijn.';
  else if(snapshot&&!snapshot.connected)notice=snapshot.message||'Er is momenteel geen verbinding met de radio.';
  else if(fresh&&missingChannelStatus&&allUsers.length===0)notice=
    'Sonoran heeft voor '+missingChannelStatus+' gebruiker(s) geen controleerbare kanaalstatus doorgestuurd. Deze gebruikers worden niet als beschikbare ploegen geteld. Controleer de kanaalgegevens in Sonoran.';
  else if(fresh&&withoutChannel&&allUsers.length===0)notice=
    'Er zijn gebruikers met een radioverbinding, maar zonder gekozen zend- of scankanaal. Alleen gebruikers in een radiokanaal worden getoond.';
  const groups=groupByTOService(displayedCrews,crew=>crew.category);
  const userCard=crew=>{
    const members=crew.members,first=members[0],storedTeam=radioCrewOnBoard(crew),onBoard=Boolean(storedTeam);
    const importable=canQuickAddRadioCrew(crew);
    const justJoined=!onBoard&&members.some(user=>radio.newIds.has(user.id));
    let action=onBoard?'<span class="radio-on-board">Op dienstbord</span>':
      !importable?(crew.category==='OPLEIDING'?'<span class="radio-unrecognized">Opleiding · ter informatie</span>':'<span class="radio-unrecognized" title="Controleer de bemanning en het roepnummer.">Controle nodig</span>'):'';
    if(onBoard&&state.env.permissions.canEdit)
      action=`<button type="button" class="button button-small radio-remove" data-action="remove-team" data-id="${esc(storedTeam.id)}" data-write${!canEdit()?' disabled':''}>－ Uit dienst</button>`;
    else if(!onBoard&&importable&&state.env.permissions.canEdit)
      action=`<button type="button" class="button button-small radio-add" data-action="radio-quick-add" data-id="${esc(first.id)}" data-write${!fresh?' data-fixed-disabled="true"':''}${!fresh||!canEdit()?' disabled':''}>＋ Op bord</button>`;
    const recognized=serviceForCategory(crew.category).id!=='overige';
    const unit=recognized?unitBadge(crew.category,'unit-token-small'):'';
    const nbStatus=crew.radioUnavailable
      ?pill(fresh?'Niet beschikbaar · NB':'NB · laatste radiostand','red')
      :crew.paired?pill('Koppel','blue'):'';
    const temporaryBadge=policeRoleBadge(crew.category,String(crew.number||''));
    const channels=[...new Set(members.map(user=>user.channel===null||user.channel===undefined||user.channel===''?'Zonder kanaal':'Kanaal '+String(user.channel)))];
    const memberNames=members.map(user=>esc(user.portalAlias||user.displayName||user.name||'Onbekend radiolabel'));
    const display=crew.paired&&recognized
      ?esc(crew.category)+'-'+esc(crew.number)+'*'
      :esc(first.portalAlias||first.name||'Onbekend radiolabel');
    return `<div class="radio-user${crew.paired?' radio-crew-paired':''}${crew.radioUnavailable?' radio-crew-nb':''}${justJoined?' radio-just-joined':''}"${recognized?' data-category="'+esc(crew.category)+'"':''}${importable&&!onBoard&&fresh&&canEdit()?' draggable="true" data-radio-drag="'+esc(first.id)+'"':''}><div class="radio-user-copy"><div class="radio-user-name"><span class="radio-indicator${fresh?' online':''}" aria-hidden="true"></span>${unit}<span class="radio-display-name" title="${esc(first.name)}">${display}</span>${crew.paired?'<span class="radio-pair-icon" title="Koppeldienst: één ploeg">👥</span>':''}${temporaryBadge}${justJoined?'<span class="radio-arrival-badge">NIEUW</span>':!onBoard?'<span class="radio-pending-badge">NOG OP TE NEMEN</span>':''}</div><small class="radio-user-channel">${recognized?esc(displayCategory(crew.category))+' · ':''}${channels.map(esc).join(' · ')}${crew.paired?' · '+members.length+' radiolid'+(members.length===1?'':'den'):''}</small>${crew.paired?'<div class="radio-crew-members">'+memberNames.map(name=>'<span>'+name+'</span>').join('')+'</div>':''}${nbStatus?'<div class="radio-crew-status">'+nbStatus+'</div>':''}</div><div class="radio-user-actions">${action}${state.env.permissions.canOperate&&first.labelEditable===true?`<button type="button" class="button button-small" data-action="radio-edit-label" data-id="${esc(first.id)}" title="Pas de naam aan in het BelgiumPD-portaal, niet in Sonoran Radio">✎ Naam aanpassen</button>`:''}</div></div>`;
  };
  panel.innerHTML=`<div class="radio-header"><div class="radio-heading"><span class="radio-symbol" aria-hidden="true">◉</span><div><h2 id="radio-title">Sonoran Radio</h2><p>Actief in radiokanalen · radiolabels</p></div>${pill(status,color)}</div><div class="radio-header-actions">${synced?`<span class="radio-last-sync">Ontvangen ${synced}</span>`:''}<button type="button" class="button button-small" data-action="radio-refresh"${radio.loading?' disabled':''}>${radio.loading?'Bijwerken…':'↻ Radio verversen'}</button></div></div>${notice?`<p class="radio-notice${radio.error||outdated?' warning':''}" role="status">${esc(notice)}</p>`:''}${snapshot&&configured?`<div class="radio-summary"><span><strong>${Number.isFinite(Number(snapshot.counts?.online))?Number(snapshot.counts.online):allUsers.length}</strong> in kanaal</span><span><strong>${Number(snapshot.counts?.recognized)||0}</strong> herkende radiogebruikers</span>${hiddenCount?'<span>'+hiddenCount+' onbekende radiolabels verborgen</span>':''}${withoutChannel?'<span>'+withoutChannel+' zonder radiokanaal</span>':''}${missingChannelStatus?'<span>'+missingChannelStatus+' kanaalstatus onbekend</span>':''}<span>Automatisch elke 15 seconden bijgewerkt</span></div>`:''}${groups.length?`<div class="radio-channels">${groups.map(service=>`<section class="radio-channel radio-service" data-service="${esc(service.id)}" aria-labelledby="radio-service-${esc(service.id)}"><h3 id="radio-service-${esc(service.id)}">${esc(service.label)} <span>${service.items.length} ${service.items.length===1?'radio-eenheid':'radio-eenheden'}</span></h3><div class="radio-users">${service.items.slice().sort((a,b)=>compareRadioUsers(a.members[0],b.members[0])).map(userCard).join('')}</div></section>`).join('')}</div>`:fresh?`<p class="radio-empty">${allUsers.length?'Geen radioploegen voor deze selectie.':'Er zijn momenteel geen gebruikers met een bevestigd radiokanaal.'}</p>`:!snapshot&&!radio.error?'<p class="radio-empty">De laatste radiostand wordt opgehaald…</p>':''}${configured&&allUsers.length?'<p class="radio-disclaimer">Herkende radioploegen tellen automatisch mee als beschikbaar. Gebruik ‘Op bord’ of sleep een nieuwe radioploeg naar het dienstbord om ze te beheren. ‘Uit dienst’ bewaart de historiek. Controleer de bemanning: een radiolabel bevestigt geen personeelsidentiteit.</p>':''}`;
  updateButtons();
}
function editRadioLabelDialog(id){
  if(!state.env?.permissions?.canOperate||!radioFresh())return;
  const user=radio.snapshot?.users?.find(u=>u.id===id);
  if(!user||user.labelEditable!==true)return;
  openDialog('Radioweergavenaam aanpassen',
    `<p class="form-note">Deze wijziging verandert uitsluitend de naam die het BelgiumPD-portaal toont. De echte Sonoran Radio-naam, radiostatus en het roepnummer blijven behouden.</p>
    <label class="field"><span>Weergavenaam</span><input class="input" name="alias" maxlength="80" minlength="2" value="${esc(user.portalAlias||'')}" placeholder="${esc(user.displayName||user.name||'Naam')}"></label>
    <p class="form-note">Origineel radiolabel: ${esc(user.name)}. Maak het veld leeg om de correctie te verwijderen.</p>`,
    {form:'radio-label',id,submit:'Naam bewaren in portaal'});
  if(!radio.snapshot.radioLabelWritesEnabled)formError('Handmatige naamcorrecties staan nog uit totdat de afzonderlijke TEST-database is bevestigd.');
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
  }finally{state.pending=false;render();updateButtons();}
}
function updateButtons(){
  for(const control of document.querySelectorAll('[data-write]')){
    const action=control.dataset.action;
    control.disabled=control.dataset.fixedDisabled==='true'||state.pending||state.stale||(['start','takeover'].includes(action)?!canOperate():!canEdit());
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
  const savedPairCount=teams.filter(team=>team.koppel||(radioFresh()&&(radio.snapshot.users||[]).some(user=>user.paired&&radioMatchesTeam(user,team)))).length;
  const selectedTeams=teams.filter(team=>matchesCategory(team.dienst)&&matches(team.dienst,team.roepnaam,...(team.leden||[]).map(member=>member.naam)));
  const pendingCrews=pendingRadioCrews();
  const pendingMarkup=pendingCrews.length?`<section class="pending-radio-section" aria-label="Nieuw aangesloten radio-eenheden" data-collapsed="${state.pendingCollapsed}"><button type="button" class="pending-radio-toggle" data-action="toggle-pending-radio" aria-expanded="${!state.pendingCollapsed}">◉ Nog op te nemen <span>${pendingCrews.length} radio-eenheid${pendingCrews.length===1?'':'en'}</span><span aria-hidden="true">${state.pendingCollapsed?'▸':'▾'}</span></button><p>Deze ploegen zijn verbonden via Sonoran en worden al meegeteld. Neem ze op met één klik of sleep ze naar de ploegen hieronder.</p><div class="pending-radio-groups">${groupByTOService(pendingCrews,crew=>crew.category).map(service=>`<section class="pending-service" data-service="${esc(service.id)}"><h4>${esc(service.label)} <span>${service.items.length}</span></h4><div class="pending-radio-grid">${service.items.map(crew=>{
    const first=crew.members[0],identity=teamVisual(crew.category);
    const importable=canQuickAddRadioCrew(crew),newlyJoined=crew.members.some(user=>radio.newIds.has(user.id));
    const members=crew.members.map(user=>user.portalAlias||user.displayName).filter(Boolean).join(' & ');
    const temporaryBadge=policeRoleBadge(crew.category,String(crew.number||''));
    return `<article class="pending-radio-card" data-service="${esc(identity.serviceId)}" style="--unit-hue:${identity.hue}"${importable&&editable?' draggable="true" data-radio-drag="'+esc(first.id)+'"':''}><div class="pending-radio-title">${unitBadge(crew.category,'unit-token-small')}<strong>${esc(crew.category)}${crew.number==='HARTS'?'':'-'+esc(crew.number||'—')}${crew.paired?'*':''}</strong>${temporaryBadge}${newlyJoined?'<span class="radio-arrival-badge">NIEUW</span>':''}</div><small>${crew.category==='ZW'?'Ziekenwagen · ':''}${esc(members||'Naam controleren')}${crew.paired?' · 👥 koppel':''}</small><div class="pending-radio-foot">${crew.radioUnavailable?pill('NB','red'):pill('Via radio','green')}${importable&&state.env.permissions.canEdit?`<button type="button" class="button button-small radio-add" data-action="radio-quick-add" data-id="${esc(first.id)}" data-write${!editable?' disabled':''}>＋ Op bord</button>`:`<span class="radio-unrecognized" title="${esc(!/^\d{1,5}$/.test(String(crew.number))?'Sonoran leverde geen zuiver numeriek roepnummer':crew.members.length>1&&!crew.paired?'Meerdere radiogebruikers met hetzelfde nummer zonder koppelteken *':'Radiogegevens kunnen niet veilig als één ploeg worden geïmporteerd')}">Controle nodig</span>`}</div></article>`;
  }).join('')}</div></section>`).join('')}</div></section>`:'';
  const teamMarkup=groupByTOService(selectedTeams,team=>team.dienst).map(service=>{
    const categories=[...new Set(service.items.map(team=>team.dienst))].sort(compareCategories);
    const sections=categories.map(category=>{
      const group=service.items.filter(team=>team.dienst===category).sort((a,b)=>String(a.roepnaam).localeCompare(String(b.roepnaam),'nl',{numeric:true}));
      const groupKey='category:'+category,collapsed=state.collapsedBoardGroups.has(groupKey);
      return `<section class="category-section"><button type="button" class="board-group-toggle category-heading category-identity" data-action="toggle-board-group" data-group="${esc(groupKey)}" aria-expanded="${!collapsed}"><span class="group-chevron" aria-hidden="true">${collapsed?'▸':'▾'}</span>${unitBadge(category,'unit-token-small')}<strong>${esc(displayCategory(category))}</strong><span>${group.length} ${group.length===1?'ploeg':'ploegen'}</span></button>${collapsed?'':`<div class="team-grid">${group.map(team=>teamCard(team,busy.get(team.id)||[],editable)).join('')}</div>`}</section>`;
    }).join('');
    const serviceKey='service:'+service.id,collapsed=state.collapsedBoardGroups.has(serviceKey);
    return `<section class="service-team-section" data-service="${esc(service.id)}" aria-labelledby="board-service-${esc(service.id)}"><button type="button" class="board-group-toggle service-heading" id="board-service-${esc(service.id)}" data-action="toggle-board-group" data-group="${esc(serviceKey)}" aria-expanded="${!collapsed}"><span class="group-chevron" aria-hidden="true">${collapsed?'▸':'▾'}</span>${esc(service.label)}<span>${service.items.length} ${service.items.length===1?'ploeg':'ploegen'}</span></button>${collapsed?'':sections}</section>`;
  }).join('');
  const filtered=allIncidents.filter(item=>(state.filter==='alle'||item.status===state.filter)&&matches(item.titel,item.postcode,item.omschrijving,incidentNumber(item.nr),...(item.ploegen||[]).map(team=>team.dienst+'-'+team.roep))).sort((a,b)=>(a.status===b.status?0:a.status==='actief'?-1:1)||b.nr-a.nr);
  const activeCount=allIncidents.filter(item=>item.status==='actief').length;
  const filter=(value,label,count)=>`<button type="button" data-action="filter-incidents" data-filter="${value}" class="${state.filter===value?'active':''}" aria-pressed="${state.filter===value}">${label} · ${count}</button>`;
  const shownPresets=state.showMoreIncidentPresets?[...INCIDENT_PRESETS,...INCIDENT_EXTRA_PRESETS]:INCIDENT_PRESETS;
  const customShortcuts=Object.values(state.shortcuts?.items||{}).sort((a,b)=>a.title.localeCompare(b.title,'nl',{sensitivity:'base'}));
  const savedPresets=customShortcuts.length?`<section class="saved-presets" aria-label="Opgeslagen meldingssneltoetsen"><h3>★ Opgeslagen sneltoetsen <span>· gedeeld tussen diensten</span></h3><div class="saved-presets-row">${customShortcuts.map(shortcut=>`<span class="saved-preset"><button type="button" class="incident-preset saved-preset-open" data-action="custom-incident-template" data-id="${esc(shortcut.id)}" title="Nieuwe melding: ${esc(shortcut.title)}" ${!editable?'disabled':''}>${esc(shortcut.title)}</button>${editable?`<button type="button" class="saved-preset-delete" data-action="remove-incident-shortcut" data-id="${esc(shortcut.id)}" aria-label="Verwijder sneltoets ${esc(shortcut.title)}" title="Sneltoets verwijderen" data-write>×</button>`:''}</span>`).join('')}</div></section>`:'';
  const presets=state.env.permissions.canEdit?`<div class="incident-presets" role="group" aria-label="Snelle meldingen">${shownPresets.map(name=>`<button type="button" class="incident-preset" data-action="incident-template" data-template="${esc(name)}" data-write${!editable?' disabled':''}>${esc(name)}</button>`).join('')}<button type="button" class="incident-preset incident-more" data-action="incident-presets-toggle" aria-expanded="${state.showMoreIncidentPresets}" aria-label="Meer veelvoorkomende meldingen tonen of verbergen">${state.showMoreIncidentPresets?'− Minder':'＋ Meer meldingen'}</button></div>`:'';
  return `${!board.session?`<section class="no-session"><div><h2>Het bord is klaar voor een nieuwe dienst.</h2><p>Start een sessie om ploegen toe te voegen en meldingen te registreren. Afgesloten diensten blijven terug te vinden in het archief.</p></div>${state.env.permissions.canOperate?button('Dienst starten','start',{primary:true,write:true}):''}</section>`:''}<div class="board-layout" data-team-view="${state.teamView}"><section aria-labelledby="teams-title"><div class="panel-heading"><div><h2 id="teams-title">Ploegen op dienstbord</h2><p>${teams.length} ${teams.length===1?'ploeg':'ploegen'} · ${savedPairCount} koppelploeg(en)</p></div><div class="board-heading-actions"><div class="team-view-switch" role="group" aria-label="Ploegenweergave"><button type="button" data-action="team-view-compact" aria-pressed="${state.teamView==='compact'}" class="${state.teamView==='compact'?'active':''}">Compact</button><button type="button" data-action="team-view-cards" aria-pressed="${state.teamView==='cards'}" class="${state.teamView==='cards'?'active':''}">Kaarten</button></div>${state.env.permissions.canEdit?button('＋ Ploeg toevoegen','add-team',{write:true}):''}</div></div>${pendingMarkup}<div class="radio-board-dropzone" data-radio-dropzone><span>↓ Sleep een radioploeg hierheen, of gebruik ‘Op bord’</span></div>${teamMarkup||empty(state.query||state.category!=='all'?'Geen ploegen gevonden':'Nog geen ploegen op het dienstbord',state.query||state.category!=='all'?'Probeer een andere zoekterm of categorie.':'Voeg een ploeg met één of twee agenten toe zodra de dienst is gestart.')}</section><section aria-labelledby="incidents-title"><div class="panel-heading"><div><h2 id="incidents-title">Meldingen</h2><p>Van oproep tot afronding, met een gedeeld logboek</p></div>${state.env.permissions.canEdit?button('＋ Nieuwe melding','create-incident',{primary:true,write:true}):''}</div>${presets}${savedPresets}${state.shortcutsError?'<p class="shortcut-load-error">'+esc(state.shortcutsError)+'</p>':''}<div class="incident-filters" role="group" aria-label="Meldingenfilter">${filter('actief','Actief',activeCount)}${filter('niet-actief','Afgerond',allIncidents.length-activeCount)}${filter('alle','Alle',allIncidents.length)}</div><div class="incident-list">${filtered.map(incidentCard).join('')||empty('Geen meldingen in dit overzicht',state.query?'Probeer een andere zoekterm.':'Nieuwe oproepen verschijnen hier. Afgeronde meldingen blijven binnen de dienst bewaard.')}</div></section></div>`;
}
function teamCard(team,busy,editable){
  const fresh=radioFresh(),radioMembers=fresh?(radio.snapshot.users||[]).filter(user=>radioMatchesTeam(user,team)):[];
  const nbOnRadio=fresh&&radioNBForTeam(team,radioMembers);
  const paired=team.koppel||radioMembers.some(user=>user.paired===true);
  const phase=['onderweg','ter-plaatse'].includes(team.responsePhase)?team.responsePhase:null;
  const beacon=phase?`<span class="response-indicator" data-phase="${phase}" role="status" aria-label="${phase==='onderweg'?'Onderweg, blauw licht knippert':'Ter plaatse, blauw licht blijft branden'}"><span class="response-light" aria-hidden="true"></span><span>${phase==='onderweg'?'ONDERWEG':'TER PLAATSE'}</span></span>`:'';
  const currentStatus=phase||(team.available===false?'pauze':'beschikbaar');
  const choiceBadge=nbOnRadio?pill('Niet beschikbaar · NB','red'):
    currentStatus==='pauze'?pill('Niet beschikbaar','red'):
    currentStatus==='onderweg'||currentStatus==='ter-plaatse'?pill('In inzet','amber'):pill('Beschikbaar','green');
  const status=choiceBadge+(busy.length?pill('Op '+incidentNumber(busy[0].nr)+(busy.length>1?' +'+(busy.length-1):''),'amber'):'');
  const onRadio=radioMembers.length>0;
  const identity=teamVisual(team.dienst);
  const stateClass=nbOnRadio||team.available===false?'on-pause':busy.length||phase?'on-incident':'ready';
  // Direct choice: status buttons are independent, not a mandatory sequence.
  // Radio NB is authoritative for availability; it cannot be overwritten here.
  const statusButton=(label,action,active,allowed)=>`<button type="button" class="crew-quick-button${active?' is-active':''}" data-action="${action}" data-id="${esc(team.id)}" data-write${!allowed?' data-fixed-disabled="true" disabled':''} aria-pressed="${active}" title="${esc(label)}">${esc(label)}</button>`;
  const phaseControls=editable?`<div class="crew-quick-controls" role="group" aria-label="Kies direct de status van ${esc(team.dienst)}-${esc(team.roepnaam)}">
    ${statusButton('↗ Onderweg','team-response-underway',currentStatus==='onderweg',!nbOnRadio&&currentStatus!=='onderweg')}
    ${statusButton('● Ter plaatse','team-response-on-scene',currentStatus==='ter-plaatse',!nbOnRadio&&currentStatus!=='ter-plaatse')}
    ${statusButton('Ⅱ Pauze / NB','team-pause',currentStatus==='pauze',currentStatus!=='pauze')}
    ${statusButton('✓ Beschikbaar','team-available',currentStatus==='beschikbaar'&&!nbOnRadio,!nbOnRadio&&currentStatus!=='beschikbaar')}
  </div>${busy.length&&currentStatus==='beschikbaar'?'<p class="team-assignment-warning">Nog gekoppeld aan een actieve melding. Gebruik ‘Ontkoppelen’ hieronder om ze ook vrij te tellen.</p>':''}`:'';
  const temporaryBadge=policeRoleBadge(team.dienst,String(team.roepnaam));
  const menuOpen=state.openCrewMenus.has(team.id);
  const compactRename=editable?radioMembers.filter(user=>user.labelEditable===true).map(user=>`<button type="button" class="button button-small" data-action="radio-edit-label" data-id="${esc(user.id)}" data-write>✎ Naam aanpassen${radioMembers.length>1?' · '+esc(user.number):''}</button>`).join(''):'';
  const compactDetach=busy.length?`<button type="button" class="button button-small" data-action="team-detach-dialog" data-id="${esc(team.id)}" data-write>↗ Ontkoppelen${busy.length>1?' ('+busy.length+')':''}</button>`:'';
  const compactMenu=editable?`<div class="compact-crew-menu"><button type="button" class="compact-menu-toggle" data-action="toggle-team-menu" data-id="${esc(team.id)}" aria-expanded="${menuOpen}">⋯ Acties</button>${menuOpen?`<div class="compact-crew-menu-content">${compactRename}${compactDetach}<button type="button" class="button button-small button-danger" data-action="remove-team" data-id="${esc(team.id)}" data-write>Uit dienst</button><small>In dienst sinds ${time(team.createdAt)}</small></div>`:''}</div>`:'';
  return `<article class="team-card" data-service="${esc(identity.serviceId)}" data-availability="${stateClass}" data-response-phase="${esc(phase||'geen')}" style="--unit-hue:${identity.hue}"><div class="team-card-body"><div class="team-top">${status}${beacon}${onRadio?'<span class="radio-team-badge">◉ Radio online</span>':''}${paired?'<span class="pair-label">👥 KOPPEL</span>':''}${temporaryBadge}</div><div class="team-identity">${unitBadge(team.dienst,'unit-token-hero')}<div class="team-identity-copy"><span class="team-category-name">${esc(displayCategory(team.dienst))}</span><div class="callsign"><strong>${esc(team.roepnaam)}</strong></div></div></div><div class="crew-list">${(team.leden||[]).map(member=>`<div class="crew-line"><span>${esc(member.naam)}</span><span class="mono">${esc(member.roep)}</span></div>`).join('')}${radioMembers.length?'<div class="crew-radio-label">◉ Radio: '+radioMembers.map(user=>esc(user.portalAlias||user.displayName||user.name||'Radiogebruiker')).join(' · ')+'</div>':''}${editable&&radioMembers.some(user=>user.labelEditable===true)?'<div class="crew-radio-rename">'+radioMembers.filter(user=>user.labelEditable===true).map(user=>'<button type="button" class="button button-small" data-action="radio-edit-label" data-id="'+esc(user.id)+'" title="Wijzig de weergavenaam op het dienstbord">✎ Naam aanpassen'+(radioMembers.length>1?' · '+esc(user.number):'')+'</button>').join('')+'</div>':''}</div>${phaseControls}</div>${compactMenu}<div class="team-card-foot"><span class="team-since">In dienst sinds ${time(team.createdAt)}</span>${state.env.permissions.canEdit?`<div class="team-actions">${busy.length?`<button type="button" class="text-button team-detach-button" data-action="team-detach-dialog" data-id="${esc(team.id)}" data-write${!editable?' disabled':''}>↗ Ontkoppelen${busy.length>1?' ('+busy.length+')':''}</button>`:''}<button type="button" class="text-button danger" data-action="remove-team" data-id="${esc(team.id)}" data-write${!editable?' disabled':''}>Uit dienst</button></div>`:''}</div></article>`;
}
function incidentCard(incident){
  return `<button type="button" class="incident-card" data-action="open-incident" data-id="${esc(incident.id)}"><span class="incident-meta"><span class="incident-number mono">${incidentNumber(incident.nr)}</span>${pill(incident.status==='actief'?'Actief':'Afgerond',incident.status==='actief'?'amber':'gray')}<span class="incident-time mono">${time(incident.createdAt)}</span></span><strong class="incident-title">${esc(incident.titel)}</strong><span class="incident-description">${esc(String(incident.omschrijving||'Geen aanvullende omschrijving.').slice(0,150))}${String(incident.omschrijving||'').length>150?'…':''}</span><span class="incident-footer"><span class="postal mono">PC ${esc(incident.postcode)}</span>${(incident.ploegen||[]).map(team=>`<span class="team-chip" data-unit-service="${esc(teamVisual(team.dienst).serviceId)}" style="--unit-hue:${teamVisual(team.dienst).hue}">${unitBadge(team.dienst,'unit-token-micro')}${esc(team.dienst)}-${esc(team.roep)}${state.env.board.ploegen[team.id]?.responsePhase==='onderweg'?' · ↗ Onderweg':state.env.board.ploegen[team.id]?.responsePhase==='ter-plaatse'?' · ● Ter plaatse':''}</span>`).join('')||'<span class="unassigned">Nog geen ploeg gekoppeld</span>'}</span></button>`;
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
function defaultName(){
  const verified=state.env?.viewer?.callsign;
  return verified||String(auth?.currentUser?.displayName||'').slice(0,60);
}
function startDialog(takeover=false){
  const session=state.env.board.session;
  const callsign=state.env.viewer?.callsign;
  const linked=typeof callsign==='string'&&/^\d{1,5}$/.test(callsign)&&Number(callsign)>0;
  const linkedSource=state.env.viewer?.callsignSource;
  const label=linked?'Jouw geverifieerde roepnummer':'Jouw naam of tijdelijk roepnummer';
  const sourceNote=linked
    ?'<p class="form-note to-verified-call">✓ Gekoppeld aan jouw Discord-ID via '+(linkedSource==='geverifieerd_tijdelijk'?'een gecontroleerde tijdelijke roepnummeraanvraag':'de personeelslijst')+'. Je roepnummer wordt door de server vastgelegd.</p>'
    :'<p class="form-note">Geen gekoppeld roepnummer gevonden. Je mag zelf een label invullen, bijvoorbeeld een tijdelijk nummer tussen 100 en 199. Dit wordt niet als een geverifieerde identiteit beschouwd.</p>';
  const intro=takeover
    ?'Je neemt onmiddellijk de lopende dienst over van '+esc(session?.to||'de huidige TO')+'. De vorige TO verliest de bediening; ploegen en meldingen blijven behouden. De overname wordt gelogd.'
    :'Je wordt de TO van deze dienst. Collega’s met toegang kunnen het bord bekijken en de dienst later overnemen.';
  openDialog(takeover?'Ben je zeker dat je deze dienst wilt overnemen?':'Nieuwe dienst starten',
    `<p class="form-note">${intro}</p><label class="field"><span>${label}</span><input class="input mono" name="displayName" maxlength="80" minlength="2" value="${esc(defaultName())}" placeholder="${linked?'Roepnummer': 'Naam of roepnummer'}" ${linked?'readonly':''} required autofocus></label>${sourceNote}`,
    {form:takeover?'takeover':'start',submit:takeover?'Ja, dienst overnemen':'Dienst starten',danger:takeover});
}
function detachTeamDialog(teamId){
  if(!canEdit())return;
  const board=state.env?.board,team=board?.ploegen?.[teamId];
  if(!team||team.endedAt)return;
  const linked=busyMap(board).get(teamId)||[];
  if(!linked.length){toast('Deze ploeg is niet meer aan een actieve melding gekoppeld.');return;}
  const chooser=linked.length===1
    ?`<p class="detach-assignment"><strong>${esc(incidentNumber(linked[0].nr))}</strong> · ${esc(linked[0].titel)}</p><input type="hidden" name="incidentId" value="${esc(linked[0].id)}">`
    :`<label class="field"><span>Welke actieve melding wil je ontkoppelen?</span><select name="incidentId" class="input" required autofocus><option value="">Selecteer de melding</option>${linked.map(incident=>`<option value="${esc(incident.id)}">${esc(incidentNumber(incident.nr)+' · '+incident.titel)}</option>`).join('')}</select></label>`;
  openDialog('Ploeg van melding ontkoppelen',
    `<p class="form-note"><strong>${esc(team.dienst)}-${esc(team.roepnaam)}</strong> is ${linked.length===1?'aan deze actieve melding':'aan '+linked.length+' actieve meldingen'} gekoppeld.</p>${chooser}<p class="form-note">De melding blijft bestaan en de ontkoppeling wordt in het meldingslogboek geregistreerd. Bij de laatste actieve koppeling wordt een eventuele uitrukfase gewist; de gekozen pauze- of beschikbaarheidstatus blijft behouden.</p>`,
    {form:'detach-team-from-card',id:teamId,submit:'Ontkoppelen bevestigen',danger:true});
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
function incidentForm(id='',preset=''){
  const incident=state.env.board.meldingen[id];
  openDialog(incident?incidentNumber(incident.nr)+' bewerken':'Nieuwe melding',`<div class="form-grid" style="margin-bottom:17px"><label class="field"><span>Postcode</span><input class="input mono" name="postcode" inputmode="numeric" pattern="[0-9]{1,8}" maxlength="8" value="${esc(incident?.postcode||'')}" required autofocus placeholder="7042"></label><label class="field"><span>Titel</span><input class="input" name="titel" maxlength="80" value="${esc(incident?.titel||preset||'')}" required placeholder="Bijvoorbeeld: winkeldiefstal"></label></div><label class="field"><span>Omschrijving</span><textarea class="input" name="omschrijving" maxlength="2000" placeholder="Relevante informatie voor de ingezette ploegen">${esc(incident?.omschrijving||'')}</textarea></label><p class="form-note">Na het aanmaken kun je ploegen koppelen. Wijzigingen blijven zichtbaar in het meldingslogboek.</p><div class="shortcut-save-controls"><button type="button" class="button button-small" data-action="save-incident-shortcut" data-write>★ Titel als sneltoets opslaan</button><small>Alleen de titel wordt bewaard, niet de postcode of incidentomschrijving.</small></div>`,{form:incident?'update-incident':'create-incident',id,submit:incident?'Wijzigingen opslaan':'Melding aanmaken'});
}
function openIncident(id){
  const incident=state.env?.board.meldingen[id];if(!incident)return;
  const editable=canEdit(),attached=new Set((incident.ploegen||[]).map(team=>team.id)),teams=activeTeams(state.env.board),busy=busyMap(state.env.board);
  const current=incident.ploegen||[];
  const body=`<div class="dialog-meta">${pill(incident.status==='actief'?'Actief':'Afgerond',incident.status==='actief'?'amber':'gray')}<span class="postal mono">PC ${esc(incident.postcode)}</span><span class="mono muted" style="font-size:10px">${time(incident.createdAt)}</span></div><p class="detail-description">${esc(incident.omschrijving||'Geen aanvullende omschrijving.')}</p>${state.env.permissions.canEdit?`<div class="detail-actions">${button(incident.status==='actief'?'✓ Melding afronden':'Melding heropenen','incident-status',{id,write:true,primary:incident.status==='actief'})}${button('Bewerken','update-incident',{id,write:true})}${button('★ Opslaan als sneltoets','save-incident-shortcut-detail',{id,write:true})}</div>`:''}<section class="detail-section"><h3>Gekoppelde ploegen · ${current.length}</h3>${current.map(team=>`<div class="assignment"><div><strong>${esc(team.dienst)}-${esc(team.roep)}</strong><small>${state.env.board.ploegen[team.id]?.endedAt?'Uit dienst':state.env.board.ploegen[team.id]?.responsePhase==='onderweg'?'Onderweg':state.env.board.ploegen[team.id]?.responsePhase==='ter-plaatse'?'Ter plaatse':'In deze melding'}</small></div>${state.env.permissions.canEdit?button('Ontkoppelen','detach-team',{id,teamId:team.id,small:true,write:true,disabled:!editable}):''}</div>`).join('')||'<p class="form-note">Er is nog geen ploeg aan deze melding gekoppeld.</p>'}</section>${state.env.permissions.canEdit&&incident.status==='actief'?`<section class="detail-section"><h3>Ploeg toevoegen</h3>${teams.filter(team=>!attached.has(team.id)).map(team=>`<div class="assignment"><div><strong>${esc(team.dienst)}-${esc(team.roepnaam)}</strong><small>${esc((team.leden||[]).map(member=>member.naam).join(' & '))}</small></div><div class="assignment-actions">${busy.has(team.id)?pill('Op melding','amber'):team.available===false?pill('Gepauzeerd','gray'):pill('Vrij','green')}${button('Koppelen','attach-team',{id,teamId:team.id,small:true,write:true,disabled:!editable})}</div></div>`).join('')||'<p class="form-note">Alle beschikbare ploegen zijn al gekoppeld.</p>'}</section>`:''}<section class="detail-section"><h3>Meldingslogboek</h3><ol class="log-list">${(incident.log||[]).slice().reverse().map(item=>`<li><span class="mono">${time(item.t)}</span><span>${esc(item.txt)}${item.by?'<br><strong>'+esc(operatorName(item.by))+'</strong>':''}</span></li>`).join('')||'<li><span></span><span>Nog geen logregels.</span></li>'}</ol></section>`;
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
      case 'team-view-compact':state.teamView='compact';render();break;
      case 'team-view-cards':state.teamView='cards';render();break;
      case 'toggle-team-menu':if(!id)break;if(state.openCrewMenus.has(id))state.openCrewMenus.delete(id);else state.openCrewMenus.add(id);render();break;
      case 'toggle-board-group':{const key=target.dataset.group;if(!key||key.length>80)break;if(state.collapsedBoardGroups.has(key))state.collapsedBoardGroups.delete(key);else state.collapsedBoardGroups.add(key);render();break;}
      case 'toggle-pending-radio':state.pendingCollapsed=!state.pendingCollapsed;render();break;
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
      case 'radio-edit-label':if(state.env?.permissions?.canOperate)editRadioLabelDialog(id);break;
      case 'radio-quick-add':await quickAddRadioCrew(id);break;
      case 'incident-template':if(canEdit()&&[...INCIDENT_PRESETS,...INCIDENT_EXTRA_PRESETS].includes(target.dataset.template))incidentForm('',target.dataset.template);break;
      case 'incident-presets-toggle':state.showMoreIncidentPresets=!state.showMoreIncidentPresets;render();break;
      case 'custom-incident-template':{
        if(!canEdit())break;
        const shortcut=state.shortcuts.items[id];if(shortcut)incidentForm('',shortcut.title);
        break;
      }
      case 'save-incident-shortcut':{
        if(!canEdit())break;
        const form=dialog.querySelector('#to-form'),title=form?.elements?.titel?.value?.trim();
        if(!title){formError('Geef eerst een titel voor de sneltoets op.');break;}
        await changeShortcut('add',{title,description:''});
        toast('Meldingssneltoets bewaard voor volgende diensten.');
        break;
      }
      case 'save-incident-shortcut-detail':{
        if(!canEdit())break;
        const incident=state.env.board.meldingen[id];
        if(!incident)break;
        await changeShortcut('add',{title:incident.titel,description:''});
        toast('Meldingssneltoets bewaard voor volgende diensten.');
        openIncident(id);
        break;
      }
      case 'remove-incident-shortcut':{
        if(!canEdit())break;
        const shortcut=state.shortcuts.items[id];if(!shortcut)break;
        openDialog('Meldingssneltoets verwijderen',
          `<p class="form-note">Wil je de gedeelde sneltoets <strong>${esc(shortcut.title)}</strong> verwijderen? Bestaande meldingen blijven ongewijzigd.</p>`,
          {form:'remove-shortcut',id,submit:'Sneltoets verwijderen',danger:true});
        break;
      }
      case 'radio-add-team':{
        if(!canEdit()||!radioFresh())break;
        const user=radio.snapshot.users.find(item=>String(item.id)===id);
        if(user&&canImportRadioUser(user)&&!radioAlreadyOnBoard(user))teamDialog(user);
        break;
      }
      case 'team-detach-dialog':if(canEdit())detachTeamDialog(id);break;
      case 'remove-team':{
        if(!canEdit())break;
        const team=state.env.board.ploegen[id];
        openDialog('Ploeg uit dienst halen',`<p class="form-note">Wil je ${esc(team.dienst)}-${esc(team.roepnaam)} uit dienst halen? De ploeg blijft bewaard in de historiek van deze dienst.</p>`,{form:'remove-team',id,submit:'Uit dienst halen',danger:true});break;
      }
      case 'toggle-team':if(canEdit()){const team=state.env.board.ploegen[id];if(team.responsePhase){toast('Wis eerst de uitrukstatus.');break;}if(busyMap(state.env.board).has(id)){toast('Deze ploeg is aan een actieve melding gekoppeld.');break;}await command('toggle-team',{id,available:team.available===false});toast('Beschikbaarheid bijgewerkt.');}break;
      case 'team-response-underway':case 'team-response-on-scene':
      case 'team-pause':case 'team-available':{
        if(!canEdit())break;
        const team=state.env.board.ploegen[id];
        if(!team||team.endedAt)break;
        const status={
          'team-response-underway':'onderweg',
          'team-response-on-scene':'ter-plaatse',
          'team-pause':'pauze',
          'team-available':'beschikbaar'
        }[action];
        const previous=team.responsePhase||((team.available===false)?'pauze':'beschikbaar');
        if(previous===status)break;
        if(status!=='pauze'&&radioFresh()&&radioNBForTeam(team,
          (radio.snapshot.users||[]).filter(user=>radioMatchesTeam(user,team)))){
          toast('De radio meldt NB. Deze status kan niet handmatig beschikbaar worden gezet.');break;
        }
        await command('set-team-status',{id,status});
        const extra=status==='beschikbaar'&&busyMap(state.env.board).has(id)
          ?' De ploeg blijft aan de actieve melding gekoppeld tot je ze daar ontkoppelt.':'';
        toast(team.dienst+'-'+team.roepnaam+': '+({
          onderweg:'onderweg','ter-plaatse':'ter plaatse',
          pauze:'pauze / niet beschikbaar',beschikbaar:'beschikbaar'
        }[status])+'.'+extra);
        break;
      }
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
// Dragging is optional: identical one-click actions remain available for touch and keyboard.
const resetRadioDrop=()=>document.querySelectorAll('[data-radio-dropzone]').forEach(node=>node.classList.remove('radio-drop-active'));
document.addEventListener('dragstart',event=>{
  const source=event.target.closest?.('[data-radio-drag]');
  if(!source||!event.dataTransfer||!canEdit()||!radioFresh())return;
  event.dataTransfer.setData('text/plain',source.dataset.radioDrag);
  event.dataTransfer.effectAllowed='copy';
  document.querySelectorAll('[data-radio-dropzone]').forEach(node=>node.classList.add('radio-drop-active'));
});
document.addEventListener('dragend',resetRadioDrop);
document.addEventListener('dragover',event=>{
  if(event.target.closest?.('[data-radio-dropzone]')&&canEdit()&&radioFresh()&&event.dataTransfer){
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  }
});
document.addEventListener('drop',async event=>{
  const area=event.target.closest?.('[data-radio-dropzone]');resetRadioDrop();
  if(!area||!event.dataTransfer||!canEdit()||!radioFresh())return;
  event.preventDefault();
  const id=event.dataTransfer.getData('text/plain');
  if(!radio.snapshot.users.some(user=>user.id===id))return;
  try{await quickAddRadioCrew(id);}catch(error){tell(error.message,'error');}
});
dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});
dialog.addEventListener('close',()=>{delete dialog.dataset.incidentId;});
dialog.addEventListener('input',event=>{previewTeam();if(el('form-error'))el('form-error').hidden=true;});
dialog.addEventListener('change',previewTeam);
dialog.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;if(form.id!=='to-form'||state.pending)return;
  const type=form.dataset.form,id=form.dataset.id,fields=form.elements,revision=Number(dialog.dataset.revision);
  let data={};
  if(type==='start'||type==='takeover')data={displayName:fields.displayName.value.trim(),...(type==='takeover'?{confirmation:'JA_OVERNAME'}:{})};
  if(type==='add-team')data={dienst:fields.dienst.value,leden:[{naam:fields.naam1.value.trim(),roep:fields.roep1.value.trim()},...(fields.koppel.checked?[{naam:fields.naam2.value.trim(),roep:fields.roep2.value.trim()}]:[])]};
  if(type==='create-incident'||type==='update-incident')data={...(id?{id}:{}),postcode:fields.postcode.value.trim(),titel:fields.titel.value.trim(),omschrijving:fields.omschrijving.value.trim()};
  if(type==='remove-team')data={id};
  if(type==='detach-team-from-card'){
    if(!canEdit()){formError('Je kunt deze ploeg niet ontkoppelen.');return;}
    const incidentId=fields.incidentId?.value;
    const linked=busyMap(state.env.board).get(id)||[];
    if(!incidentId||!linked.some(incident=>incident.id===incidentId)){
      formError('Deze koppeling is niet meer actief. Vernieuw het dienstbord en probeer opnieuw.');return;
    }
    try{
      await command('detach-team',{id:incidentId,teamId:id},revision);
      closeDialog();
      toast('Ploeg van '+incidentNumber(linked.find(item=>item.id===incidentId).nr)+' ontkoppeld. De melding blijft bestaan.');
    }catch(error){if(!error.obsolete)formError(error.message);}
    return;
  }
  if(type==='radio-label'){
    if(!state.env?.permissions?.canOperate||!radioFresh()){formError('Geen bevoegdheid of actuele radiostand.');return;}
    if(!radio.snapshot?.radioLabelWritesEnabled){formError('Radioweergavenaamcorrecties staan op deze omgeving nog uit.');return;}
    try{
      const alias=fields.alias.value.trim()||null;
      await request('/api/to/radio/label',{method:'POST',body:JSON.stringify({radioId:id,alias})});
      closeDialog();toast('Weergavenaam bewaard in BelgiumPD. Sonoran Radio werd niet aangepast.');
      await refreshRadio();
    }catch(error){if(!error.obsolete)formError(error.message);}
    return;
  }
  if(type==='remove-shortcut'){
    try{
      await changeShortcut('remove',{id});
      closeDialog();toast('Sneltoets verwijderd. Bestaande meldingen zijn behouden.');
    }catch(error){if(!error.obsolete)formError(error.message);}
    return;
  }
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
