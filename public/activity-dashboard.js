// Presentation only. Inputs originate from the already-authorized Activity Centre endpoint.
const $=id=>document.getElementById(id);
const TILES=[['active','Actief','Officiële status'],['half','50/50','Opvolgstatus'],
 ['inactive','Inactief','Opvolgstatus'],['leave','Verlof','Goedgekeurd'],
 ['checking','CHECKING','Controle vereist'],['review','60+ dagen','Manueel beoordelen']];
let active='',initialized=false,verifiedLeave=false;
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
 priority.querySelector('h2').textContent='Wie heeft opvolging nodig?';
 // Visible on first load; user can close it.
 $('activityGraphs').open=true;
}
export function renderActivityDashboard(people,sources,onSelect){
 initialize();verifiedLeave=sources?.approvedLeaveComplete===true;
 const safe=Array.isArray(people)?people:[];
 if($('filter').value||$('attentionOnly').checked)active='';
 $('activityAuthorizedTotal').textContent=String(safe.length);
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
  button.onclick=()=>{active=active===key?'':key;onSelect()};
  container.append(button);
 }
}
