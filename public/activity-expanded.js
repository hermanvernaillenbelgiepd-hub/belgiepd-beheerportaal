// Authorized read-only activity dashboard; writes reuse existing protected dossier APIs.
// Neither legacy Google Sheets nor the browser grants write permissions.
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=String(text??'');if(cls)node.className=cls;return node};
const prettyDate=date=>{
 const a=String(date||'').split('-');
 return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:String(date||'—');
};
const categories=[
 ['leave','In goedgekeurd verlof','Inclusief begin- en einddatum'],
 ['next15','Richting 50/50 · 10–14 dagen','Binnen vijf effectieve dagen tot 15'],
 ['next30','Richting INACTIEF · 15–29 dagen','Drempel van 30 effectieve dagen'],
 ['next60','Richting 60+ · 30–59 dagen','Manuele beoordeling na 60 effectieve dagen'],
 ['review60','60+ dagen · beoordelen','Geen automatische archivering of verwijdering']
];
let state={people:[],sources:{},asOf:''},recipient=null,attached=false;
const groupFor=p=>{
 if(p.leave?.active===true)return 'leave';
 if(state.sources?.approvedLeaveComplete!==true)return '';
 const d=p.effectiveInactiveDays;
 if(!Number.isSafeInteger(d))return '';
 if(d>=60)return 'review60';
 if(d>=30)return 'next60';
 if(d>=15)return 'next30';
 if(d>=10)return 'next15';
 return '';
};
function description(p,extra=''){
 const items=[];
 if(Number.isFinite(p.calendarInactiveDays))items.push(p.calendarInactiveDays+' dagen zonder verbinding');
 if(Number.isFinite(p.excludedLeaveDays))items.push(p.excludedLeaveDays+' goedgekeurde verlofdagen');
 if(Number.isFinite(p.effectiveInactiveDays))items.push(p.effectiveInactiveDays+' effectieve inactiviteitsdagen');
 if(extra)items.push(extra);
 items.push(p.verified?'geverifieerde FiveM-bron':'historische bron (indicatief)');
 if(p.activitySourceDate)items.push('bron '+prettyDate(p.activitySourceDate));
 return items.join(' · ');
}
function actions(p,li){
 const div=el('div','', 'activity-row-actions'),a=document.createElement('a');
 a.href='/personeelsbeheer.html?'+new URLSearchParams({
  fiche:'1',dept:p.department,discordId:p.discordId}).toString();
 a.textContent='Open dossier';
 const ping=el('button','Kopieer Discord @mention');ping.type='button';
 ping.onclick=async()=>{
  const mention='<@'+p.discordId+'>';
  try{await navigator.clipboard.writeText(mention);
   ping.textContent='Gekopieerd · niet verzonden';
  }catch{window.prompt('Kopieer deze mention en verstuur ze zelf op Discord:',mention)}
 };
 const notice=el('button','Portaalmelding');notice.type='button';
 notice.onclick=()=>{
  recipient=p;
  $('activityExpandedNoticePerson').textContent=p.call+' · '+p.name+' · '+p.department+
   (p.verified?' · geverifieerde bron':' · historisch brongegeven');
  $('activityExpandedNoticeKind').value='';
  $('activityExpandedNoticeDetails').value='';
  $('activityExpandedNoticeFeedback').textContent='';
  $('activityExpandedNoticeDialog').showModal();
 };
 div.append(a,ping,notice);li.append(div);
}
function line(list,p,info){
 const li=document.createElement('li');
 li.append(el('strong',p.call+' · '+p.name),el('small',info));
 actions(p,li);list.append(li);
}
function openFollowups(){
 const host=$('activityExpandedGroups');host.replaceChildren();
 if(!$('activityExpandedFollowup').open)return;
 for(const [key,title,hint] of categories){
  const box=el('div','', 'activity-mini'),list=document.createElement('ol');
  const rows=state.people.filter(p=>groupFor(p)===key).sort((a,b)=>
   key==='leave'?(a.leave?.endDate||'').localeCompare(b.leave?.endDate||''):
    (b.effectiveInactiveDays||0)-(a.effectiveInactiveDays||0));
  box.append(el('h3',title+' ('+rows.length+')'),el('p',hint,'source-note'));
  for(const p of rows){
   const periods=(p.leavePeriods||[]).map(x=>
    prettyDate(x.startDate)+' – '+prettyDate(x.endDate)).join(' / ');
   line(list,p,description(p,key==='leave'?periods:''));
  }
  if(!rows.length)list.append(el('li','Geen dossiers in deze categorie.'));
  box.append(list);host.append(box);
 }
}
function openRankings(){
 const host=$('activityExpandedRankRows');host.replaceChildren();
 if(!$('activityExpandedRankings').open)return;
 const verified=state.people.filter(p=>p.verified===true&&Number.isFinite(p.periodPlayHours));
 const values=verified.length?verified:state.people.filter(p=>
  Number.isFinite(p.periodPlayHours)&&p.lastCheck);
 $('activityExpandedRankSource').textContent=verified.length?
  'Gecontroleerde vorige kalendermaand · '+values.length+' leden met geverifieerde maanduren.':
  'Historisch speeluurverschil sinds de vorige reset · '+values.length+
  ' leden met gegevens. Niet gelijk aan een afgeronde kalendermaand; uitsluitend ter inzage.';
 for(const [title,sorter] of [
  ['Top 10 meest actief',(a,b)=>b.periodPlayHours-a.periodPlayHours],
  ['Top 10 minst actief',(a,b)=>a.periodPlayHours-b.periodPlayHours]
 ]){
  const box=el('div','', 'activity-mini'),list=document.createElement('ol');
  box.append(el('h3',title));
  for(const p of [...values].sort((a,b)=>sorter(a,b)||
    String(a.call).localeCompare(String(b.call))).slice(0,10)){
   line(list,p,p.periodPlayHours.toLocaleString('nl-BE')+' uur · '+
    (p.verified?'geverifieerde maand':'historisch periodeverschil')+
    (p.activitySourceDate?' · bron '+prettyDate(p.activitySourceDate):''));
  }
  if(!list.children.length)list.append(el('li','Geen bruikbare speeluren beschikbaar.'));
  box.append(list);host.append(box);
 }
}
function renderCounters(){
 const grouped=Object.fromEntries(categories.map(x=>[x[0],0]));
 for(const p of state.people){const key=groupFor(p);if(key)grouped[key]++}
 const host=$('activityExpandedCounters');host.replaceChildren();
 for(const [key,title] of categories){
  const button=el('button','', 'counter');button.type='button';
  button.append(el('strong',grouped[key]),el('small',title));
  button.onclick=()=>{
   $('activityExpandedFollowup').open=true;openFollowups();
   $('activityExpandedFollowup').scrollIntoView({block:'nearest'});
  };
  host.append(button);
 }
}
async function submitNotice(event){
 event.preventDefault();
 if(!recipient)return;
 const p=recipient,kind=$('activityExpandedNoticeKind').value,details=$('activityExpandedNoticeDetails').value.trim();
 if(!kind||details.length<15||details.length>1200){
  $('activityExpandedNoticeFeedback').textContent='Kies opvolging en geef minstens 15 tekens motivering.';return;
 }
 if(!window.confirm('Portaalmelding aan '+p.name+' registreren? Dit logt in het dossier en weekrapport. Er wordt GEEN Discord-DM verstuurd.'))return;
 const button=$('activityExpandedNoticeSubmit');button.disabled=true;
 try{
  const authSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
  const user=authSdk.getAuth().currentUser;
  if(!user)throw Error('Meld je opnieuw aan.');
  const token=await user.getIdToken();
  const response=await fetch('/api/management/cases',{method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({dept:p.department,discordId:p.discordId,type:'inactiviteitsping',
    eventDate:state.asOf,activityStatus:kind,discordPingSent:false,portalNotice:true,details})});
  const saved=await response.json().catch(()=>({}));
  if(!response.ok||saved.saved!==true)throw Error(saved.error||'Melding kon niet worden geregistreerd.');
  $('activityExpandedNoticeDialog').close();
  recipient=null;
  $('feedback').textContent='Portaalmelding voor '+p.name+' opgeslagen · dossierreferentie '+
   saved.reference+'. Discord-mention blijft apart te kopiëren.';
 }catch(e){$('activityExpandedNoticeFeedback').textContent=e.message}
 finally{button.disabled=false}
}
export function renderActivityExtension({people,asOf,sources}){
 state={people:Array.isArray(people)?people:[],asOf:String(asOf||''),sources:sources||{}};
 if(!attached){
  attached=true;
  $('activityExpandedFollowup').addEventListener('toggle',openFollowups);
  $('activityExpandedRankings').addEventListener('toggle',openRankings);
  $('activityExpandedNoticeCancel').addEventListener('click',()=>$('activityExpandedNoticeDialog').close());
  $('activityExpandedNoticeForm').addEventListener('submit',submitNotice);
 }
 renderCounters();openFollowups();openRankings();
}
