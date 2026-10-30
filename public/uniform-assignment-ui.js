import {getTier} from '/assets/organogram-hierarchie-model.js';
export function setupUniformAssignmentUI({api,$}){
 const get=id=>$(id),dept=get('uniformAssignDept'),scope=get('uniformAssignScope');
 const target=get('uniformAssignTarget'),asset=get('uniformAssignImage');
 const badge=get('uniformAssignBadge'),reason=get('uniformAssignReason');
 const status=get('uniformAssignStatus'),list=get('uniformAssignList');
 const departments=[['politie','Politie'],['brandweer','Brandweer'],['ambulance','Ambulance'],
  ['depannage','Depannage'],['burger','Burger']];
 let allowed=[],people=[],artworks=[],rules=[];
 const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
 const message=(s,bad=false)=>{status.textContent=s;status.classList.toggle('error',bad)};
 const key=()=>dept.value+'_'+scope.value+'_'+target.value;
 const rule=()=>rules.find(r=>r.key===key());
 function rebuildTargets(){
  const old=target.value;
  target.replaceChildren();
  const current=people.filter(p=>p.dept===dept.value);
  const entries=scope.value==='service'?[['default','Alle leden van de hulpdienst']]:
   scope.value==='cadre'?[...new Map(current.map(p=>[clean(getTier(p)),getTier(p)])
    .filter(([code])=>Boolean(code))).entries()].map(([a,b])=>[a,b]):
   scope.value==='rank'?[...new Map(current.map(p=>[clean(p.rank),String(p.rank||'')])
    .filter(([code])=>Boolean(code))).entries()].map(([a,b])=>[a,b]):
   current.filter(p=>/^\d{15,22}$/.test(String(p.personId||''))||Boolean(clean(p.call)))
    .map(p=>[/^\d{15,22}$/.test(String(p.personId||''))?String(p.personId):'call_'+clean(p.call),
     String(p.name||'Onbekend')+' · '+String(p.call||'')+' · '+String(p.rank||'')+
     (/^\d{15,22}$/.test(String(p.personId||''))?'':' · koppeling via roepnummer')]);
  const seen=new Set();
  for(const [id,label]of entries.sort((a,b)=>a[1].localeCompare(b[1],'nl'))){
   if(seen.has(id))continue;seen.add(id);target.add(new Option(label,id));
  }
  if([...target.options].some(x=>x.value===old))target.value=old;
  applyRule();
 }
 function rebuildAssets(){
  const old=asset.value;
  asset.replaceChildren(new Option('Standaarduniform behouden',''));
  for(const a of artworks.filter(r=>r.active&&r.kind==='uniform'&&r.department===dept.value)){
   asset.add(new Option(a.label+' · '+a.code,a.code));
  }
  if([...asset.options].some(x=>x.value===old))asset.value=old;
  else asset.value='';
 }
 function applyRule(){
  const current=rule();
  asset.value=current?.uniformCode||'';
  badge.value=current?.badgeStyle||'';
 }
 function showRules(){
  list.replaceChildren();
  const rows=rules.filter(x=>x.department===dept.value);
  if(!rows.length){list.textContent='Geen afwijkende uniformtoewijzingen voor deze hulpdienst.';return}
  for(const r of rows){
   const row=document.createElement('div');row.className='uniform-assignment-row';
   const label=document.createElement('span');
   const member=people.find(p=>(p.personId===r.selector||'call_'+clean(p.call)===r.selector)&&p.dept===r.department);
   label.textContent=(r.scope==='person'?(member?member.name+' · '+member.call:r.selector):
    r.scope==='service'?'Hulpdienst':r.selector.replace(/_/g,' '))+
    ' · Uniform: '+(r.uniformCode||'standaard')+
    ' · Badges: '+(r.badgeStyle||'standaard');
   const edit=document.createElement('button');edit.type='button';edit.className='alt';
   edit.textContent='Wijzigen';
   edit.onclick=()=>{
    scope.value=r.scope;rebuildTargets();
    target.value=r.selector;applyRule();
    message('Bestaande toewijzing gekozen. Pas aan en bewaar opnieuw.');
   };
   row.append(label,edit);list.append(row);
  }
 }
 async function reload(){
  const [settings,library,organogram]=await Promise.all([
   api('/api/uniform-assignments'),api('/api/role-artwork/manage'),
   api('/api/organogram/hierarchie').catch(()=>({records:[]}))
  ]);
  allowed=settings.editableDepartments||[];
  rules=settings.assignments||[];
  artworks=library.artworks||[];
  people=(organogram.records||[]).filter(p=>p&&allowed.includes(p.dept));
  const oldDept=dept.value;
  dept.replaceChildren();
  for(const [code,label]of departments)if(allowed.includes(code))dept.add(new Option(label,code));
  if(allowed.includes(oldDept))dept.value=oldDept;
  if(!dept.options.length)throw Error('Geen beheertoegang voor uniformtoewijzingen.');
  rebuildAssets();rebuildTargets();showRules();
  message('Toewijzingen geladen. Enkel bewuste wijzigingen worden gepubliceerd.');
 }
 dept.addEventListener('change',()=>{rebuildAssets();rebuildTargets();showRules()});
 scope.addEventListener('change',rebuildTargets);
 target.addEventListener('change',applyRule);
 const payload=()=>({department:dept.value,scope:scope.value,selector:target.value,
  uniformCode:asset.value,badgeStyle:badge.value,reason:reason.value.trim()});
 get('uniformAssignSave').onclick=async()=>{
  const data=payload();
  if(!data.selector){message('Geen geldige doelgroep geselecteerd.',true);return}
  if(data.reason.length<8){message('Vul een motivering van minstens acht tekens in.',true);return}
  if(!data.uniformCode&&!data.badgeStyle){
   message('Kies een uniform en/of lokale/federale badge. Wis de regel om te herstellen.',true);return;
  }
  const b=get('uniformAssignSave');b.disabled=true;
  try{
   await api('/api/uniform-assignments',{method:'PUT',body:data});
   await reload();message('Uniformtoewijzing opgeslagen. Rangen en toegangsrechten blijven ongewijzigd.');
  }catch(e){message('Opslaan mislukt: '+e.message,true)}
  finally{b.disabled=false}
 };
 get('uniformAssignRemove').onclick=async()=>{
  const data=payload();
  if(!rule()){message('Voor deze doelgroep is geen afwijking opgeslagen.',true);return}
  if(data.reason.length<8){message('Geef een motivering van minstens acht tekens.',true);return}
  if(!confirm('Afwijkende uniform- en badgeweergave voor deze doelgroep wissen?'))return;
  const b=get('uniformAssignRemove');b.disabled=true;
  try{
   await api('/api/uniform-assignments',{method:'DELETE',body:{
    department:data.department,scope:data.scope,selector:data.selector,reason:data.reason}});
   await reload();message('Afwijking verwijderd; de standaardweergave wordt opnieuw gebruikt.');
  }catch(e){message(e.message,true)}
  finally{b.disabled=false}
 };
 get('uniformAssignReload').onclick=()=>reload().catch(e=>message(e.message,true));
 return {load:async()=>{try{await reload()}catch(e){message(e.message,true)}}};
}
