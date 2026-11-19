import {canonicalPoliceSpecialty,groupPoliceSeries,groupPoliceSpecialties,groupServiceSpecialties} from './personnel-grouping-policy.js';
import {applyGroupSettings,specialtyGroupKey,GROUP_TIER_DEFAULTS} from './personnel-group-settings-policy.js';
// One read-only presentation over the existing, permission-checked organogram.
// All user-supplied names are textContent; no identifier or role is sent back.
const el=(tag,cls='',value)=>{const x=document.createElement(tag);
 if(cls)x.className=cls;if(value!==undefined)x.textContent=String(value);return x};
const headings=['leadership','instructors','members','trainees'];
const deptNames={politie:'Politie',brandweer:'Brandweer',ambulance:'Ambulance',
 depannage:'Depannage',burger:'Burger'};
// Stable default when opening the personnel overview: Reeks 1/2 and,
// in Police specialties, Motard/K-9. User toggles remain free afterwards.
export function defaultPersonnelGroupOpen(mode,department,key){
 if(mode==='reeksen')return department==='politie'&&['1','2'].includes(String(key));
 return mode==='specialisaties'&&department==='politie'&&
   ['MOTARD','K9'].includes(canonicalPoliceSpecialty(key));
}
function safePatch(person,key){
 const matches=(Array.isArray(person?.specialtyPatches)?person.specialtyPatches:[])
  .filter(p=>specialtyGroupKey(p.label,person.dept)===key&&
   typeof p.imageUrl==='string'&&
   /^\/api\/role-artwork\/file\/[a-zA-Z0-9_-]+(?:\?v=[a-zA-Z0-9_-]+)?$/.test(p.imageUrl));
 return matches.find(p=>p.source==='person')||matches[0]||null;
}
export function mountPersonnelGroupedViews({root,status,title,search,departmentSelect,fetchData,viewerUid,openPerson}){
 let records=null,settings={},owner='',mode='reeksen',dept='politie',
  loading=null,stale=false,error='',loadedAt=0;
 const groupOpen=new Map();
 const formatCount=n=>n+' '+(n===1?'lid':'leden');
 function memberRow(p,specialty){
  const validCall=p.dept==='politie'&&/^(?:[a-z]{1,6}[- ]?)?\d{3}$/i.test(String(p.call||'')),
   row=el(validCall?'button':'div','personnel-group-person');
  if(validCall){
   row.type='button';
   row.setAttribute('aria-label','Open personeelskaart van '+p.name+', '+p.call);
   row.addEventListener('click',()=>openPerson(p.call,p.name));
  }
  row.append(el('span','personnel-group-call',p.call||'—'));
  const who=el('span','personnel-group-identity');
  who.append(el('strong','',p.name||'Onbekend'),
   el('small','',p.rank||'Politie'));
  row.append(who);
  if(specialty){
   const art=safePatch(p,specialty);
   const patch=el('span','personnel-group-patch');
   if(art){
    const image=el('img');
    image.alt='Patch '+specialty;
    image.loading='lazy';image.decoding='async';image.src=art.imageUrl;
    image.addEventListener('error',()=>patch.replaceChildren(el('span','',specialty)),{once:true});
    patch.append(image);
   }else patch.append(el('span','',specialty));
   row.append(patch);
  }
  return row;
 }
 function section(titleValue,people,specialty){
  if(!people.length)return null;
  const container=el('div','personnel-group-subsection');
  const header=el('h4','',titleValue+' · '+formatCount(people.length));
  const list=el('div','personnel-group-members');
  for(const p of people)list.append(memberRow(p,specialty));
  container.append(header,list);return container;
 }
 function render(){
  root.replaceChildren();
  const q=String(search.value||'').trim().toLocaleLowerCase('nl-BE');
  const scoped=mode==='reeksen'?'politie':dept;
  const filtered=(records||[]).filter(p=>p.dept===scoped&&
   [p.name,p.call,p.rank,p.series,...(Array.isArray(p.specialties)?p.specialties:[])]
   .some(x=>String(x??'').toLocaleLowerCase('nl-BE').includes(q)));
  // Only operational Reeks 1, Reeks 2 and Reeks 3 appear in personnel
  // navigation. Kader, Vlinder and invalid source series remain represented
  // in the underlying roster/organogram; this is a display choice only.
  const base=mode==='reeksen'?groupPoliceSeries(filtered)
    .filter(group=>['1','2','3'].includes(group.key)):
    groupServiceSpecialties(filtered,scoped);
  const groups=applyGroupSettings(base,settings[scoped],mode);
  const shown=groups.filter(g=>g.total);
  departmentSelect.disabled=mode==='reeksen';
  title.textContent=mode==='reeksen'?'Politie · Reeksen':
   (deptNames[dept]||dept)+' · Specialisaties';
  status.textContent=error?error:loading?'Actuele personeelsindeling laden…':
   !records?'Open het overzicht om de actuele gegevens te laden.':
   (stale?'Bron tijdelijk verouderd · ':'')+
   filtered.length+' medewerkers · '+shown.length+' categorieën met leden'+
   (mode==='specialisaties'?' · één hoofdgroep per specialisatie':'');
  if(!records||loading)return;
  if(!shown.length){root.append(el('p','personnel-group-empty',
   q?'Geen overeenkomstige politiemedewerkers gevonden.':'Geen actieve indelingen beschikbaar.'));return}
  for(const g of shown){
   const item=el('details','personnel-group-card '+(g.color||''));
   const openKey=mode+':'+scoped+':'+g.key;
   item.open=groupOpen.has(openKey)?groupOpen.get(openKey):
     defaultPersonnelGroupOpen(mode,scoped,g.key);
   item.addEventListener('toggle',()=>{
     // A rerender can detach the old details element before this event runs.
     if(item.isConnected)groupOpen.set(openKey,item.open);
   });
   const summary=el('summary','personnel-group-summary');
   summary.append(el('strong','',mode==='reeksen'?g.title:
    (g.icon||'🏷️')+' '+g.label));
   summary.append(el('span','personnel-group-count',formatCount(g.total)));
   item.append(summary);
   const inner=el('div','personnel-group-content');
   if(mode==='reeksen'){
    const head=section('Reekshoofden',g.heads);
    const members=section(g.key==='kader'?'Kaderleden':'Leden',g.members);
    if(head)inner.append(head);
    if(members)inner.append(members);
   }else for(const key of headings){
    const label=settings[scoped]?.tiers?.[key]||GROUP_TIER_DEFAULTS[key];
    const sub=section(label,g.groups[key],g.key);if(sub)inner.append(sub);
   }
   item.append(inner);root.append(item);
  }
 }
 async function refresh(force=false){
  const current=viewerUid();
  if(!current){records=null;owner='';error='Meld je aan met je goedgekeurde portaalaccount om deze indeling te bekijken.';render();return}
  if(!force&&records&&owner===current&&Date.now()-loadedAt<60000){render();return}
  if(loading){await loading;render();return}
  records=null;error='';owner=current;stale=false;
  loading=(async()=>{
   try{
    const data=await fetchData();
    if(viewerUid()!==current)return;
    if(!Array.isArray(data?.records)||data?.readOnly!==true)
     throw Error('Ongeldige personeelsindeling ontvangen');
    records=data.records.filter(p=>Object.hasOwn(deptNames,p?.dept));
    settings=data.groupSettings||{};
    loadedAt=Date.now();stale=data.stale===true;
   }catch(e){
    if(viewerUid()!==current)return;
    error='Indeling niet beschikbaar: '+(e?.message||'onbekende fout')+
     '. De bestaande personeelslijst blijft beschikbaar.';
   }
  })();
  render();
  try{await loading}finally{loading=null}
  render();
 }
 search.addEventListener('input',render);
 departmentSelect.addEventListener('change',()=>{
  if(Object.hasOwn(deptNames,departmentSelect.value)){
   dept=departmentSelect.value;render();
  }
 });
 return {
  activate(next){if(!['reeksen','specialisaties'].includes(next))return;
   mode=next;return refresh(false)},
  refresh(){return refresh(true)},
  reset(){groupOpen.clear();owner='';records=null;settings={};error='';stale=false;loadedAt=0;render()}
 };
}
