// Presentation only. Inputs originate from the already-authorized Activity Centre endpoint.
const $=id=>document.getElementById(id);
const TILES=[['active','Actief','Officiële status'],['half','50/50','Opvolgstatus'],
 ['inactive','Inactief','Opvolgstatus'],['leave','Verlof','Goedgekeurd'],
 ['checking','CHECKING','Controle vereist'],['review','60+ dagen','Manueel beoordelen']];
let active='',initialized=false,verifiedLeave=false,activeTab='overview';
const DASHBOARD_TABS=[['overview','Overzicht'],['followup','Opvolging'],['history','Historiek']];
function belongs(p,key){
 const status=String(p.currentStatus||'').trim().toLowerCase();
 if(key==='active')return status==='actief'&&!p.returnChecking&&!p.leave?.active;
 if(key==='half')return status==='50/50';
 if(key==='inactive')return status==='inactief';
 if(key==='leave')return p.leave?.active===true;
 if(key==='checking')return p.returnChecking===true;
 if(key==='review')return verifiedLeave&&Number.isSafeInteger(p.effectiveInactiveDays)&&p.effectiveInactiveDays>=60;
 return true;
}
export function activityStatusTileMatch(p){
 if($('filter').value||$('attentionOnly').checked)return true;
 return !active||belongs(p,active);
}
function initialize(){
 if(initialized)return;
 initialized=true;
 const root=$('content');
 const filter=$('department').closest('section'),
 overview=$('counts').closest('section'),
 graphs=$('activityGraphs').closest('section'),
 priority=$('activityExpandedCounters').closest('section'),
 warning=$('returnPanel'),
 ranking=$('activityExpandedRankings').closest('section'),
 records=$('recordsPanel').closest('section'),
 roster=$('personnelDetails').closest('section');
 const panels=[filter,overview,graphs,priority,warning,ranking,records,roster];
 const ids=['activityFilterPanel','activityOverviewPanel','activityChartsPanel',
  'activityPriorityPanel','activityReturnPanel','activityRankingPanel',
  'activityRecordsPanel','activityPersonnelPanel'];
 panels.forEach((section,i)=>{if(i!==4)section.id=ids[i];root.append(section)});
 // Preserve IDs on existing elements and all existing input/event listeners.
 const heading=overview.querySelector('h2');
 heading.firstChild.textContent='Personeel in één oogopslag ';
 const top=document.createElement('div');top.className='activity-panel-heading';
 const eyebrow=document.createElement('span');eyebrow.className='activity-eyebrow';
 eyebrow.textContent='DASHBOARD';
 const title=document.createElement('div');title.append(eyebrow,heading);
 const total=document.createElement('div');total.className='activity-total';
 const number=document.createElement('strong');number.id='activityAuthorizedTotal';
 const label=document.createElement('small');label.textContent='bevoegde dossiers';
 total.append(number,label);top.append(title,total);overview.prepend(top);
 const tiles=document.createElement('div');tiles.id='activityStatusTiles';
 tiles.className='activity-status-tiles';tiles.setAttribute('role','group');
 tiles.setAttribute('aria-label','Personeelsstatussen');
 const note=document.createElement('p');note.className='activity-status-note';
 note.textContent='60+ dagen is een opvolgdrempel, geen officiële personeelsstatus. Categorieën kunnen overlappen.';
 const diagnostics=document.createElement('details');diagnostics.id='activitySourceDetail';
 diagnostics.className='activity-source-detail';
 const summary=document.createElement('summary');summary.textContent='Bronopvolging en datakwaliteit';
 diagnostics.append(summary,$('counts'),$('statisticsDetails'),$('sourceNote'));
 const existingNote=overview.querySelector(':scope > p.source-note');if(existingNote)existingNote.remove();
 overview.append(tiles,note,diagnostics);
 const filterLabel=document.createElement('div');filterLabel.className='activity-eyebrow';
 filterLabel.textContent='FILTERS · Dienst, reeks en opvolging';
 filter.prepend(filterLabel);
 priority.querySelector('h2').textContent='Nieuwe activiteitsdrempels (geverifieerde bron vereist)';
 const priorityHint=document.createElement('p');priorityHint.className='source-note';
 priorityHint.textContent='Deze tellers tonen nieuwe opvolging op basis van recente, controleerbare verbindingsgegevens. De officiële statussen 50/50 en INACTIEF staan afzonderlijk in de grote tegels; daarom kunnen deze waarden nul zijn.';
 priority.querySelector('h2').after(priorityHint);
 // Three tabs replace long initial scroll. No hidden panel gains access:
 // tabs only move the already-authorized DOM sections.
 const nav=document.createElement('nav');nav.id='activityDashboardTabs';
 nav.className='activity-dashboard-tabs';nav.setAttribute('aria-label','Activiteitencentrum navigatie');
 const tabs=Object.create(null);
 for(const [key,label] of DASHBOARD_TABS){
  const button=document.createElement('button');button.type='button';
  button.dataset.tab=key;button.textContent=label;button.setAttribute('role','tab');
  button.id='activityTab_'+key;button.setAttribute('aria-controls','activityTabPanel_'+key);
  button.onclick=()=>selectTab(key);nav.append(button);
  const panel=document.createElement('div');panel.className='activity-tab-panel';
  panel.id='activityTabPanel_'+key;panel.setAttribute('role','tabpanel');
  panel.setAttribute('aria-labelledby',button.id);tabs[key]=panel;
 }
 root.prepend(nav);
 root.append(tabs.overview,tabs.followup,tabs.history);
 for(const element of [filter,overview,graphs,ranking])tabs.overview.append(element);
 const selected=document.createElement('section');
 selected.id='activitySelectedStatusPanel';selected.className='activity-selected-status';
 selected.setAttribute('aria-live','polite');selected.hidden=true;
 tabs.followup.append(selected);
 for(const element of [priority,warning,roster])tabs.followup.append(element);
 tabs.history.append(records);
 selectTab(activeTab);
 // Visible on first load; user can close it.
 $('activityGraphs').open=true;
}
function selectTab(key){
 activeTab=DASHBOARD_TABS.some(([id])=>id===key)?key:'overview';
 for(const [id] of DASHBOARD_TABS){
  const pane=$('activityTabPanel_'+id),button=$('activityTab_'+id);
  if(pane)pane.hidden=id!==activeTab;
  if(button){
   button.setAttribute('aria-selected',String(id===activeTab));
   button.tabIndex=id===activeTab?0:-1;
  }
 }
}
// Directe, geautoriseerde namenlijst van exact dezelfde personen als de gekozen tegel.
// Geen activiteitsoordeel of geverifieerde connectie afleiden uit oude Sheets.
function formatActivityDate(value){
 const text=String(value||'');
 return /^\d{4}-\d{2}-\d{2}$/.test(text)?
   text.slice(8,10)+'/'+text.slice(5,7)+'/'+text.slice(0,4):text||'Niet beschikbaar';
}
function renderSelectedStatus(people){
 const root=$('activitySelectedStatusPanel');if(!root)return;
 root.replaceChildren();root.hidden=!active;
 if(!active)return;
 const tile=TILES.find(([key])=>key===active);
 const matched=people.filter(p=>belongs(p,active));
 const h=document.createElement('h2');
 h.textContent=(tile?.[1]||'Geselecteerde status')+' · '+matched.length+' personeelsleden';
 const hint=document.createElement('p');hint.className='source-note';
 hint.textContent='Dit zijn de personen uit de aangeklikte status, niet uitsluitend nieuwe activiteitspings. Uren en verbindingsdatums zijn alleen actueel wanneer de FiveM-bron dat bevestigt. Klik bij een medewerker in de volledige lijst op Diensturen API voor de afzonderlijke dienstregistraties.';
 root.append(h,hint);
 const list=document.createElement('div');list.className='activity-selected-list';list.setAttribute('role','list');
 for(const p of matched){
  const item=document.createElement('article');item.className='activity-selected-person';
  item.setAttribute('role','listitem');
  const title=document.createElement('strong');
  title.textContent=(p.call||'—')+' · '+(p.name||'Onbekend')+' · '+(p.department||'—');
  const status=document.createElement('small');
  status.textContent='Officiële status: '+(p.currentStatus||'Niet bekend');
  const connection=document.createElement('small');
  connection.textContent='Laatste verbinding: '+formatActivityDate(p.lastConnection)+
    (p.lastConnection?(p.verified?' · geverifieerde FiveM-bron':' · oudere bron (indicatief)'):
      ' · geen actuele meting');
  const hours=document.createElement('small');
  hours.textContent=p.periodPlayHours===null||!Number.isFinite(p.periodPlayHours)?
   'Speeluren: geen verifieerbare meting':
   'Speeluren: '+p.periodPlayHours+' uur · '+
    (p.verified?'geverifieerde afgesloten maand':'oude bron (niet geverifieerd)');
  const actions=document.createElement('a');
  actions.href='/dossiercentrum.html?'+new URLSearchParams({
   dept:p.department,discordId:p.discordId}).toString();
  actions.textContent='Dossier openen';
  item.append(title,status,connection,hours,actions);list.append(item);
 }
 if(!matched.length){
  const empty=document.createElement('p');
  empty.textContent='Geen medewerkers in deze selectie. Controleer de ingestelde dienst, reeks en zoekterm.';
  list.append(empty);
 }
 root.append(list);
}
export function renderActivityDashboard(people,sources,onSelect){
 initialize();verifiedLeave=sources?.approvedLeaveComplete===true;
 const safe=Array.isArray(people)?people:[];
 if($('filter').value||$('attentionOnly').checked)active='';
 $('activityAuthorizedTotal').textContent=String(safe.length);
 renderSelectedStatus(safe);
 const container=$('activityStatusTiles');container.replaceChildren();
 for(const [key,name,note] of TILES){
  const count=safe.filter(p=>belongs(p,key)).length;
  const button=document.createElement('button');button.type='button';
  button.className='activity-status-tile';button.dataset.tone=key;
  button.setAttribute('aria-pressed',String(active===key));
  button.setAttribute('aria-label',name+': '+count+' personen');
  const label=document.createElement('span');label.className='activity-status-heading';
  const dot=document.createElement('span');dot.className='activity-status-dot';
  const title=document.createElement('span');title.textContent=name;label.append(dot,title);
  const strong=document.createElement('strong');strong.textContent=String(count);
  const small=document.createElement('small');small.textContent=note;
  button.append(label,strong,small);
  button.onclick=()=>{active=active===key?'':key;selectTab('followup');onSelect()};
  container.append(button);
 }
}
