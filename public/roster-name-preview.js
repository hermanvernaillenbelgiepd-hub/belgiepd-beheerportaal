// Accessible read-only staff preview. Only displays fields already present in
// the current roster; never fetches protected dossiers or role privileges.
let active=null;
let serial=0;
function textEl(tag,value,cls){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 el.textContent=String(value??'');
 return el;
}
function display(value){
 const text=String(value??'').trim();
 return text||'—';
}
function previewSpecialties(person){
 const entries=Array.isArray(person?.specialties)?person.specialties:[];
 return entries.filter(entry=>entry&&typeof entry.label==='string'&&
   !['','NEE','NEEN','NIET INGEVULD','NIET GECONTROLEERD','N.V.T.','NVT']
    .includes(String(entry.value??entry.status??'').trim().toLocaleUpperCase('nl-BE')))
   .slice(0,6).map(x=>({label:x.label.slice(0,65),
     state:String(x.value??x.status??'').trim().slice(0,35)}));
}
function closePreview(){
 const previous=active;
 if(!previous)return;
 active=null;
 previous.anchor.removeAttribute('aria-describedby');
 previous.overlay.remove();
}
function placePreview(anchor,overlay){
 const rect=anchor.getBoundingClientRect();
 const width=overlay.offsetWidth||310;
 const height=overlay.offsetHeight||190;
 let left=rect.left;
 left=Math.max(10,Math.min(left,window.innerWidth-width-10));
 let top=rect.bottom+9;
 if(top+height>window.innerHeight-10)top=rect.top-height-9;
 top=Math.max(8,Math.min(top,window.innerHeight-height-8));
 overlay.style.left=left+'px';
 overlay.style.top=top+'px';
}
function showPreview(anchor,person,{clickHint=false}={}){
 if(active?.anchor===anchor)return;
 closePreview();
 if(!document.body.contains(anchor))return;
 const tooltip=document.createElement('div');
 tooltip.className='roster-name-preview';
 tooltip.setAttribute('role','tooltip');
 tooltip.id='bpd-roster-name-preview-'+(++serial);
 tooltip.append(textEl('strong',display(person.name),'roster-name-preview-title'));
 const meta=document.createElement('div');meta.className='roster-name-preview-meta';
 for(const [label,value] of [
  ['Roepnummer',person.call],['Rang',person.rank],
  ['Reeks',person.series],['Status',person.status]
 ]){
  const row=document.createElement('div');row.className='roster-name-preview-line';
  row.append(textEl('span',label),textEl('strong',display(value)));
  meta.append(row);
 }
 tooltip.append(meta);
 const specs=previewSpecialties(person);
 if(specs.length){
  const line=document.createElement('div');line.className='roster-name-preview-specs';
  line.append(textEl('span','Specialisaties','roster-name-preview-caption'));
  const tags=document.createElement('div');tags.className='roster-name-preview-tags';
  for(const spec of specs){
   const chip=textEl('span',spec.label+(spec.state?' · '+spec.state:''),'roster-name-preview-tag');
   tags.append(chip);
  }
  line.append(tags);tooltip.append(line);
 }
 if(clickHint)tooltip.append(textEl('small','Klik op de naam om de personeelskaart te openen.'));
 document.body.append(tooltip);
 anchor.setAttribute('aria-describedby',tooltip.id);
 active={anchor,overlay:tooltip};
 placePreview(anchor,tooltip);
}
let globalListeners=false;
function globalDismiss(){
 if(globalListeners)return;
 globalListeners=true;
 document.addEventListener('scroll',closePreview,true);
 window.addEventListener('resize',closePreview);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape')closePreview();
 });
}
export function attachRosterNamePreview(anchor,person,options={}){
 if(!anchor||!person||!person.name)return;
 globalDismiss();
 anchor.classList.add('roster-name-preview-anchor');
 // On the management table, the name is non-interactive text. Tabindex
 // makes its hover information accessible by keyboard as well.
 if(!anchor.matches('button,a,[tabindex]'))anchor.tabIndex=0;
 anchor.addEventListener('mouseenter',()=>showPreview(anchor,person,options));
 anchor.addEventListener('focus',()=>showPreview(anchor,person,options));
 anchor.addEventListener('mouseleave',()=>{
  if(active?.anchor===anchor)closePreview();
 });
 anchor.addEventListener('blur',()=>{
  if(active?.anchor===anchor)closePreview();
 });
}
export function dismissRosterNamePreview(){closePreview()}
