// Shared read-only Police roster used by the lower-cadre home and public
// personnel-list page. No editing links or dossier references are rendered.
import './personnel-list-visuals.js';
import {policeGroupedRoster,policeTierDisplay} from './police-roster-cadre.js';
import {policeRosterSeriesBadges} from './police-roster-series.js';
import {attachRosterNamePreview,dismissRosterNamePreview} from './roster-name-preview.js';

export const PUBLIC_POLICE_SPECIALTIES=Object.freeze([
  'INTERVENTIEDIENST','Radio BM','SIV/WPR','Signalisatie','Motor','Semi-ano.',
  'K9','RAGO','Dispatch','TO','AE','LRD (Recherche)'
]);
let customPublicSpecialties=[];
export function setPublicRosterSpecialties(items=[]){
 const base=new Set(PUBLIC_POLICE_SPECIALTIES.map(x=>x.toLocaleLowerCase('nl-BE')));
 customPublicSpecialties=[];
 for(const x of Array.isArray(items)?items:[]){
  if(!x||typeof x.label!=='string'||x.public!==true)continue;
  const label=x.label.trim(),key=label.toLocaleLowerCase('nl-BE');
  if(!label||label.length>64||base.has(key))continue;
  base.add(key);
  customPublicSpecialties.push({label,icon:typeof x.icon==='string'?x.icon.slice(0,10):''});
  if(customPublicSpecialties.length===20)break;
 }
}
const visibleSpecialties=()=>[
 ...PUBLIC_POLICE_SPECIALTIES,...customPublicSpecialties.map(x=>x.label)
];
const visual=()=>window.BPDPersonnelVisuals;
function element(tag,text,cls=''){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);
 return n;
}
function addCell(row,child,cls=''){
 const td=element('td',undefined,cls);
 if(typeof child==='string'||typeof child==='number')td.textContent=String(child);
 else if(child)td.append(child);
 row.append(td);return td;
}
// Status styling is a view concern only; never normalize or write back a
// personnel status. Unknown statuses stay neutral (not 'Verwijderd').
export function policeRosterStatusStyle(value){
 const status=String(value??'').trim().toLocaleUpperCase('nl-BE')
  .replace(/\s+/g,' ');
 if(status==='ACTIEF')return 'actief';
 if(status==='VERLOF')return 'verlof';
 if(status==='INACTIEF')return 'inactief';
 if(/^50\s*\/\s*50$/.test(status))return 'fifty-fifty';
 if(status==='NON-ACTIEF'||status==='NON ACTIEF'||status==='NONACTIEF')
  return 'non-actief';
 if(status==='VERWIJDERD')return 'verwijderd';
 return 'onbekend';
}
function specialTag(value){
 const state=String(value||'Niet ingevuld').trim();
 const upper=state.toLocaleUpperCase('nl-BE');
 if(upper==='JA'||upper==='ACTIEF')return 'yes';
 if(upper==='NEE'||upper==='NEEN')return 'no';
 if(upper==='STAGE'||upper==='AANGEMELD')return 'stage';
 if(['DOCENT','SPECIALISATIE','LEIDING','INSTRUCTEUR',
   'AE-F (SRT+DSU)'].includes(upper)||upper.startsWith('AE-'))return 'lead';
 if(upper==='RESTRICTED'||upper==='WAARSCHUWING')return 'warning';
 return 'unknown';
}
function seriesCell(person){
 const wrap=element('div',undefined,'mr-series');
 for(const badge of policeRosterSeriesBadges({...person,dept:'politie'},
     visual().seriesWithCadre({...person,dept:'politie'},person.series))){
   const x=element('span',badge.label,'mr-series-badge mr-'+badge.type);
   if(badge.title)x.title=badge.title;
   wrap.append(x);
 }
 return wrap;
}
function rankCell(person){
 const info=visual().rankInfo(person.rank,'politie');
 const wrap=element('span',undefined,'mr-rank');
 wrap.title=info.label||'Rang onbekend';
 if(person.hasPoliceEntry===false){wrap.textContent='—';return wrap;}
 if(info.image){
   const img=document.createElement('img');
   img.src=info.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
   img.className='mr-insignia';wrap.append(img);
 }
 wrap.append(element('strong',info.code||'—'));
 return wrap;
}
function rosterHeaderLabel(label){return label==='INTERVENTIEDIENST'?'INTERVENTIE':
 label==='LRD (Recherche)'?'LRD':label;}
function renderHeader(thead){
 const tr=element('tr');
 for(const title of ['CALL','RANGKENTEKEN','PERSONEELSLID','REEKS','STATUS'])
   tr.append(element('th',title));
 for(const label of visibleSpecialties()){
   const th=element('th',undefined,'mr-specialty-head');
   th.title=label;
   const banner=visual().specialtyBannerDisplay(label);
   const fallback=()=>{
     th.classList.remove('mr-specialty-head--patch');
     th.replaceChildren();
     const pic=element('span',undefined,'mr-specialty-icon');
     pic.textContent=customPublicSpecialties.find(x=>x.label===label)?.icon||
       visual().specialtyIcon(label);
     pic.setAttribute('aria-hidden','true');
     th.append(pic,element('small',rosterHeaderLabel(label)));
   };
   if(banner){
     th.classList.add('mr-specialty-head--patch');
     th.setAttribute('aria-label',label);
     if(banner.type==='sprite'){
       const tile=element('span',undefined,
         'mr-specialty-banner mr-specialty-banner--sprite');
       tile.style.backgroundImage='url("'+banner.url+'")';
       tile.style.backgroundPosition='center '+banner.position+'%';
       tile.setAttribute('aria-hidden','true');
       th.append(tile,element('small',rosterHeaderLabel(label)));
     }else{
       const img=document.createElement('img');
       img.src=banner.url;img.alt=label;img.loading='lazy';
       img.className='mr-specialty-banner';
       img.onerror=()=>fallback();
       th.append(img,element('small',rosterHeaderLabel(label)));
     }
   }else fallback();
   tr.append(th);
 }
 thead.replaceChildren(tr);
}

/* Keep the mobile directory as a REAL compact list, not stacked person cards.
   Desktop continues to render the complete read-only specialization matrix.
   Rows are projected from the same rendered data, so filters/sorting stay identical. */
function renderMobilePoliceRoster(thead,tbody){
 const desktop=tbody.closest('table');
 if(!desktop?.parentElement)return;
 const previous=[...desktop.parentElement.children].find(
   node=>node.classList?.contains('mr-mobile-roster'));
 previous?.remove();
 const table=element('table',undefined,'mr-mobile-roster');
 table.setAttribute('aria-label','Personeelslijst voor gsm en tablet');
 const header=element('thead');
 const heading=element('tr');
 for(const text of ['CALL','RANG','NAAM','REEKS','STATUS','INFO'])
   heading.append(element('th',text));
 header.append(heading);
 const body=element('tbody');
 const headings=[...(thead.rows[0]?.cells||[])];
 for(const sourceRow of tbody.rows){
   if(sourceRow.classList.contains('mr-divider')){
     const divider=element('tr',undefined,'mr-mobile-divider');
     const cell=element('td');cell.colSpan=6;
     cell.append(...[...sourceRow.cells[0].childNodes].map(node=>node.cloneNode(true)));
     divider.append(cell);body.append(divider);
     continue;
   }
   if(!sourceRow.classList.contains('mr-person')){
     const empty=element('tr');
     const cell=element('td',sourceRow.textContent.trim());cell.colSpan=6;
     empty.append(cell);body.append(empty);
     continue;
   }
   const sourceCells=[...sourceRow.cells];
   const tr=element('tr',undefined,'mr-mobile-person');
   const call=element('td',sourceCells[0]?.textContent?.trim()||'—','mr-mobile-call');
   const rank=element('td',undefined,'mr-mobile-rank');
   const insignia=sourceCells[1]?.firstElementChild?.cloneNode(true);
   if(insignia)rank.append(insignia);
   const name=element('td',undefined,'mr-mobile-name');
   const nameWrap=element('span',undefined,'mr-person-name-wrap');
   const sourceButton=sourceCells[2]?.querySelector('.mr-person-open');
   if(sourceButton){
     const button=element('button',sourceButton.textContent,'mr-person-open');
     button.type='button';
     button.setAttribute('aria-label',sourceButton.getAttribute('aria-label')||'Open personeelskaart');
     button.addEventListener('click',()=>sourceButton.click());
     nameWrap.append(button);
   }else{
     nameWrap.append(element('strong',sourceCells[2]?.querySelector('strong')?.textContent||
       sourceCells[2]?.textContent?.trim()||'—'));
   }
   const services=sourceCells[2]?.querySelector('.mr-person-affiliations');
   if(services)nameWrap.append(services.cloneNode(true));
   name.append(nameWrap);
   const series=element('td',undefined,'mr-mobile-series');
   if(sourceCells[3])series.append(...[...sourceCells[3].childNodes].map(node=>node.cloneNode(true)));
   const status=element('td',undefined,'mr-mobile-status');
   if(sourceCells[4])status.append(...[...sourceCells[4].childNodes].map(node=>node.cloneNode(true)));
   const info=element('td',undefined,'mr-mobile-info');
   const detail=element('tr',undefined,'mr-mobile-detail');
   detail.hidden=true;
   const detailCell=element('td');detailCell.colSpan=6;
   const details=element('div',undefined,'mr-mobile-specialties');
   for(let index=5;index<sourceCells.length;index++){
     const title=headings[index]?.getAttribute('title')||
       headings[index]?.getAttribute('aria-label')||
       headings[index]?.textContent?.trim()||'Specialisatie';
     const item=element('div',undefined,'mr-mobile-specialty');
     item.append(element('strong',title));
     const value=sourceCells[index]?.firstElementChild?.cloneNode(true)||
       element('span',sourceCells[index]?.textContent?.trim()||'—');
     item.append(value);details.append(item);
   }
   detailCell.append(details);detail.append(detailCell);
   const toggle=element('button','+','mr-mobile-detail-toggle');
   toggle.type='button';
   toggle.setAttribute('aria-expanded','false');
   const displayName=sourceButton?.textContent||name.textContent.trim();
   toggle.setAttribute('aria-label','Toon specialisaties van '+displayName);
   toggle.addEventListener('click',()=>{
     const expanded=detail.hidden;
     detail.hidden=!expanded;
     toggle.textContent=expanded?'−':'+';
     toggle.setAttribute('aria-expanded',String(expanded));
     toggle.setAttribute('aria-label',(expanded?'Verberg':'Toon')+
       ' specialisaties van '+displayName);
   });
   info.append(toggle);
   tr.append(call,rank,name,series,status,info);
   body.append(tr,detail);
 }
 table.append(header,body);
 desktop.after(table);
}

export function renderMemberPoliceRoster(thead,tbody,records,query='',onPersonClick=null){
 dismissRosterNamePreview();
 const q=String(query).trim().toLocaleLowerCase('nl-BE');
 const people=(Array.isArray(records)?records:[])
   .filter(p=>[p.call,p.name,p.rank,p.series,p.status,
     ...(Array.isArray(p.specialties)?p.specialties.map(x=>x.label):[])]
     .some(v=>String(v??'').toLocaleLowerCase('nl-BE').includes(q)))
   .map(p=>({...p,dept:'politie'}));
 renderHeader(thead);
 const frag=document.createDocumentFragment();
 const groups=policeGroupedRoster(people);
 for(const [tier,rows] of groups){
   const title=element('tr',undefined,'mr-divider mr-'+tier);
   const cell=element('td');cell.colSpan=5+visibleSpecialties().length;
   cell.append(element('strong',policeTierDisplay(tier).label));
   cell.append(element('small',rows.length+' personeelsleden','mr-count'));
   title.append(cell);frag.append(title);
   for(const person of rows){
     const tr=element('tr',undefined,'mr-person');
     addCell(tr,person.call||'—','mr-call');
     addCell(tr,rankCell(person),'mr-rank-cell');
     // The full rank name is available via the insignia tooltip and dossier.
     const nameCell=element('strong',person.name||'—');
     const nameWrapper=element('span',undefined,'mr-person-name-wrap');
     const clickable=typeof onPersonClick==='function'&&person.hasPoliceEntry!==false;
     if(clickable){
      const nameButton=element('button',undefined,'mr-person-open');
      nameButton.type='button';
      nameButton.textContent=person.name||'—';
      nameButton.setAttribute('aria-label','Open personeelskaart van '+(person.name||'')+
       ' ('+(person.call||'onbekende call')+')');
      nameButton.addEventListener('click',()=>onPersonClick(person));
      attachRosterNamePreview(nameButton,person,{clickHint:true});
      nameWrapper.append(nameButton);
     }else{
       attachRosterNamePreview(nameCell,person);
       nameWrapper.append(nameCell);
     }
     const affiliations=Array.isArray(person.services)?person.services:[];
     if(affiliations.length>1||person.hasPoliceEntry===false)
       nameWrapper.append(element('small','Diensten: '+affiliations.join(' · '),
         'mr-person-affiliations'));
     addCell(tr,nameWrapper,'mr-name-cell');
     addCell(tr,seriesCell(person));
     const status=String(person.status||'Onbekend').trim()||'Onbekend';
     addCell(tr,element('span',status,
       'mr-status mr-status--'+policeRosterStatusStyle(status)),'mr-status-cell');
     for(const label of visibleSpecialties()){
       const info=visual().specialtyStateFor(person,label);
       const value=String(info.status||'Niet ingevuld');
       const td=addCell(tr,element('span',value,'mr-specialty mr-'+specialTag(value)),
         'mr-specialty-cell');
       td.title=label+' · '+value;
     }
     frag.append(tr);
   }
 }
 tbody.replaceChildren(frag);
 if(!people.length){
   const empty=element('tr');
   const cell=element('td','Geen personeelsleden gevonden.');
   cell.colSpan=5+visibleSpecialties().length;
   empty.append(cell);tbody.append(empty);
 }
 renderMobilePoliceRoster(thead,tbody);
 return people.length;
}
