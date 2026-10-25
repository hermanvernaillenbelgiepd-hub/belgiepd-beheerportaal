// Shared read-only Police roster used by the lower-cadre home and public
// personnel-list page. No editing links or dossier references are rendered.
import './personnel-list-visuals.js';
import {policeGroupedRoster,policeTierDisplay} from './police-roster-cadre.js';
import {policeRosterSeriesBadges} from './police-roster-series.js';

export const PUBLIC_POLICE_SPECIALTIES=Object.freeze([
  'Radio BM','SIV/WPR','Signalisatie','Motor','Semi-ano.',
  'K9','RAGO','Dispatch','TO','AE'
]);
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
 if(info.image){
   const img=document.createElement('img');
   img.src=info.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
   img.className='mr-insignia';wrap.append(img);
 }
 wrap.append(element('strong',info.code||'—'));
 return wrap;
}
function renderHeader(thead){
 const tr=element('tr');
 for(const title of ['CALL','RANGKENTEKEN','NAAM VAN RANG',
   'PERSONEELSLID','REEKS','STATUS'])
   tr.append(element('th',title));
 for(const label of PUBLIC_POLICE_SPECIALTIES){
   const th=element('th',undefined,'mr-specialty-head');
   th.title=label;
   const pic=element('span',undefined,'mr-specialty-icon');
   const image=visual().specialtyIconImage(label);
   if(image){
     const img=document.createElement('img');
     img.src=image;img.alt='';img.loading='lazy';
     img.className='mr-specialty-image';
     pic.append(img);
   }else pic.textContent=visual().specialtyIcon(label);
   pic.setAttribute('aria-hidden','true');
   th.append(pic,element('small',label));
   tr.append(th);
 }
 thead.replaceChildren(tr);
}
export function renderMemberPoliceRoster(thead,tbody,records,query=''){
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
   const cell=element('td');cell.colSpan=6+PUBLIC_POLICE_SPECIALTIES.length;
   cell.append(element('strong',policeTierDisplay(tier).label));
   cell.append(element('small',rows.length+' personeelsleden','mr-count'));
   title.append(cell);frag.append(title);
   for(const person of rows){
     const tr=element('tr',undefined,'mr-person');
     addCell(tr,person.call||'—','mr-call');
     addCell(tr,rankCell(person),'mr-rank-cell');
     addCell(tr,visual().rankInfo(person.rank,'politie').label);
     addCell(tr,element('strong',person.name||'—'));
     addCell(tr,seriesCell(person));
     addCell(tr,element('span',person.status||'Onbekend','mr-status'));
     for(const label of PUBLIC_POLICE_SPECIALTIES){
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
   cell.colSpan=6+PUBLIC_POLICE_SPECIALTIES.length;
   empty.append(cell);tbody.append(empty);
 }
 return people.length;
}
