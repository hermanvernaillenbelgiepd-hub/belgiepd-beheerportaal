// Cloud-backed uniform image library and visual-only assignment editor.
// Does not modify personnel ranks, Discord membership or awards.
import {POLICE_CALL_GRADES,AMBULANCE_FUNCTIONS} from '/uniform-profile-policy.js';
export function setupUniformLibraryUI({api,$}){
 const departments=[['politie','Politie'],['brandweer','Brandweer'],['ambulance','Ambulance'],
  ['depannage','Depannage'],['burger','Burger'],['beveiliging','Beveiliging (voorbereiding)']];
 const kinds=[['rank','Gradenplaat'],['uniform','Uniform'],['helmet','Helm'],
  ['profession','Beroepsteken'],['logo','Dienstlogo'],['patch','Patch'],
  ['specialty','Specialisatiebadge'],['pictogram','Pictogram'],
  ['medal','Medaille (alleen bibliotheek)'],['award','Ereteken (alleen bibliotheek)']];
 const ruleKinds=kinds.filter(([k])=>!['uniform','medal','award','specialty'].includes(k));
 const mk=(value,label)=>new Option(label,value);
 const callScope=document.querySelector('#libraryAssignScope option[value="call"]');
 const functionScope=document.querySelector('#libraryAssignScope option[value="function"]');
 function updateScopes(){
  const dept=ruleDept.value;
  for(const [option,show] of [[callScope,dept==='politie'],
   [functionScope,dept==='ambulance']]){
   if(option){option.hidden=!show;option.disabled=!show;}
  }
  if(ruleScope.selectedOptions[0]?.disabled)ruleScope.value='rank';
 }
 const presets=()=>{
  const list=$('libraryAssignPresets');if(!list)return;
  list.replaceChildren();
  const choices=ruleScope.value==='call'&&ruleDept.value==='politie'?POLICE_CALL_GRADES:
   ruleScope.value==='function'&&ruleDept.value==='ambulance'?AMBULANCE_FUNCTIONS:[];
  for(const [code,label]of choices){
   const option=document.createElement('option');option.value=code;option.label=label;list.append(option);
  }
 };
 const uploadDept=$('libraryDept'),uploadKind=$('libraryKind'),
  ruleDept=$('libraryAssignDept'),ruleKind=$('libraryAssignKind'),
  ruleScope=$('libraryAssignScope'),ruleTarget=$('libraryAssignTarget'),
  ruleAsset=$('libraryAssignAsset'),list=$('libraryList'),
  preview=$('libraryPreview'),file=$('libraryFile');
 let assets=[],rules=[],authorized=[],status={storageReady:false};
 const show=(id,message,bad=false)=>{
  const node=$(id);node.textContent=message;node.classList.toggle('error',bad);
 };
 for(const [id,items]of [[uploadDept,departments],[uploadKind,kinds],[ruleDept,departments],[ruleKind,ruleKinds]])
  for(const [code,label]of items)id.append(mk(code,label));
 function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);}
 function available(dept,kind){
  return assets.filter(a=>a.department===dept&&a.kind===kind&&a.active!==false)
   .sort((a,b)=>String(a.label).localeCompare(String(b.label),'nl'));
 }
 function fillAssets(){
  const old=ruleAsset.value;
  ruleAsset.replaceChildren(mk('','Selecteer een afbeelding uit de bibliotheek'));
  for(const item of available(ruleDept.value,ruleKind.value))
   ruleAsset.append(mk(item.code,item.label+' ('+item.code+')'));
  ruleAsset.value=[...ruleAsset.options].some(x=>x.value===old)?old:'';
 }
 function fillRuleTargets(){
  const scope=ruleScope.value;
  ruleTarget.placeholder=scope==='person'?'Discord-ID of call_reepnummer':
   scope==='call'?'bijv. 400, 500 of 600':
   scope==='function'?'ambulancier, vpk, arts of dirmed':
   scope==='rank'?'bijv. sergeant of hoofdinspecteur':
    scope==='cadre'?'bijv. basiskader of middenkader':'default';
  presets();
  ruleTarget.disabled=scope==='service';
  if(scope==='service')ruleTarget.value='default';
  else if(ruleTarget.value==='default')ruleTarget.value='';
 }
 const keyFor=(rule)=>rule.department+'_'+rule.kind+'_'+rule.scope+'_'+rule.selector;
 const ruleLabel=r=>r.department.toUpperCase()+' · '+r.kind+' · '+r.scope+' · '+
  r.selector+' → '+r.assetCode;
 function updateRules(){
  const name=ruleDept.value,kind=ruleKind.value;
  const rows=rules.filter(x=>x.department===name&&x.kind===kind);
  const out=$('libraryRuleList');out.replaceChildren();
  if(!rows.length){out.textContent='Voor deze combinatie zijn nog geen koppelingen opgeslagen.';return}
  for(const r of rows){
   const line=document.createElement('div');line.className='uniform-assignment-row';
   const label=document.createElement('span');label.textContent=ruleLabel(r);
   const pick=document.createElement('button');pick.type='button';pick.textContent='Selecteren';
   pick.className='alt';
   pick.onclick=()=>{
    ruleScope.value=r.scope;fillRuleTargets();ruleTarget.value=r.selector;
    ruleAsset.value=r.assetCode;show('libraryAssignStatus','Geselecteerde koppeling kun je aanpassen of wissen.');
   };
   line.append(label,pick);out.append(line);
  }
 }
 function updateCatalog(){
  list.replaceChildren();
  const items=assets.filter(a=>a.department===uploadDept.value&&a.kind===uploadKind.value)
   .sort((a,b)=>String(a.label).localeCompare(String(b.label),'nl'));
  $('libraryCount').textContent=items.length+' afbeelding(en)';
  if(!items.length){list.textContent='Geen afbeeldingen voor deze selectie.';return}
  for(const item of items){
   const card=document.createElement('div');card.className='artwork-item';
   const img=document.createElement('img');img.src=item.imageUrl;img.alt='';img.loading='lazy';
   img.style.cssText='object-fit:contain;width:110px;height:70px';
   const info=document.createElement('div');
   const title=document.createElement('b');title.textContent=item.label;
   const meta=document.createElement('small');meta.textContent=item.kind+' · '+item.code;
   const button=document.createElement('button');button.textContent='Selecteren';
   button.type='button';button.className='alt';
   button.onclick=()=>{
    uploadDept.value=item.department;uploadKind.value=item.kind;
    $('libraryCode').value=item.code;$('libraryLabel').value=item.label;
    const family=kinds.map(([v])=>v);
    if(family.includes(item.kind)&&ruleKinds.some(([v])=>v===item.kind)){
     ruleDept.value=item.department;ruleKind.value=item.kind;fillAssets();
     ruleAsset.value=item.code;updateRules();
    }
    show('libraryUploadStatus','Geselecteerd: '+item.label+'. Upload een nieuw bestand om te vervangen of bekijk oude versies.');
    void loadVersions(item.key);
   };
   info.append(title,meta);card.append(img,info,button);list.append(card);
  }
 }
 async function loadVersions(key){
  $('libraryVersionKey').value=key;
  const v=$('libraryVersions');v.replaceChildren(mk('','Kies een vorige versie'));
  try{
   const result=await api('/api/uniform-library/versions?key='+encodeURIComponent(key));
   for(const entry of result.versions||[])
    v.append(mk(entry.id,(entry.date?new Date(entry.date).toLocaleString('nl-BE')+' · ':'')+
     entry.label+' ('+entry.version+')'));
   show('libraryUploadStatus','Versiehistoriek geladen voor '+key);
  }catch(e){show('libraryUploadStatus',e.message,true)}
 }
 async function reload(){
  const [s,manifest,current]=await Promise.all([
   api('/api/uniform-library/status'),
   api('/api/role-artwork/manifest'),
   api('/api/uniform-library/rules')
  ]);
  status=s;authorized=s.editableDepartments||[];
  assets=(manifest.artworks||[]).filter(a=>a&&kinds.some(([k])=>k===a.kind));
  rules=current.rules||[];
  $('libraryStorageNote').textContent=s.storageReady?
   'Cloud Storage beschikbaar · PNG, JPG of WebP tot 4 MB · originele bestanden blijven bewaard':
   'Cloud Storage nog niet geconfigureerd. Bestaande afbeeldingen blijven bruikbaar; nieuwe hoge-resolutie uploads wachten op de opslaginstelling.';
  $('libraryUpload').disabled=!s.storageReady;
  for(const select of [uploadDept,ruleDept]){
   for(const item of [...select.options])item.hidden=!authorized.includes(item.value);
   if(!authorized.includes(select.value))select.value=authorized[0]||'';
  }
  updateScopes();fillRuleTargets();updateCatalog();fillAssets();updateRules();
  $('libraryPanel').hidden=!authorized.length;
  $('libraryAssignmentPanel').hidden=!authorized.length;
  return Boolean(authorized.length);
 }
 uploadDept.onchange=()=>{updateCatalog();$('libraryVersionKey').value='';$('libraryVersions').replaceChildren(mk('','Kies een vorige versie'))};
 uploadKind.onchange=uploadDept.onchange;
 ruleDept.onchange=()=>{updateScopes();fillRuleTargets();fillAssets();updateRules()};
 ruleKind.onchange=ruleDept.onchange;
 ruleScope.onchange=fillRuleTargets;
 updateScopes();fillRuleTargets();
 let blobUrl='';
 file.onchange=()=>{
  if(blobUrl)URL.revokeObjectURL(blobUrl);
  blobUrl='';preview.hidden=true;preview.removeAttribute('src');
  const selected=file.files?.[0];
  if(!selected)return;
  if(!['image/png','image/jpeg','image/webp'].includes(selected.type)||selected.size>4*1024*1024){
   file.value='';show('libraryUploadStatus','Selecteer een PNG, JPG of WebP van maximaal 4 MB.',true);return;
  }
  blobUrl=URL.createObjectURL(selected);preview.src=blobUrl;preview.hidden=false;
  show('libraryUploadStatus','Afbeelding geselecteerd. Het originele bestand wordt bewaard.');
 };
 $('libraryUpload').onclick=async()=>{
  const selected=file.files?.[0],button=$('libraryUpload');
  const department=uploadDept.value,kind=uploadKind.value,
   code=normalize($('libraryCode').value),label=$('libraryLabel').value.trim(),
   reason=$('libraryUploadReason').value.trim();
  if(!selected||!code||!label){show('libraryUploadStatus','Kies een bestand, code en naam.',true);return}
  if(!authorized.includes(department)){show('libraryUploadStatus','Geen rechten voor deze hulpdienst.',true);return}
  button.disabled=true;
  try{
   const dataUrl=await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(Error('Afbeelding kon niet gelezen worden'));
    reader.readAsDataURL(selected);
   });
   await api('/api/uniform-library/assets',{method:'PUT',
    body:{department,kind,code,label,reason,dataUrl}});
   show('libraryUploadStatus','Afbeelding en versiegeschiedenis opgeslagen in Firebase Cloud Storage.');
   file.value='';preview.hidden=true;
   await reload();await loadVersions(kind+'_'+department+'_'+code);
  }catch(e){show('libraryUploadStatus',e.message,true)}
  finally{button.disabled=!status.storageReady}
 };
 $('libraryRestore').onclick=async()=>{
  const key=$('libraryVersionKey').value,versionId=$('libraryVersions').value,
   reason=$('libraryUploadReason').value.trim();
  if(!key||!versionId)return show('libraryUploadStatus','Selecteer een onderdeel en een vorige versie.',true);
  if(!window.confirm('Deze oudere afbeelding opnieuw actief maken? De huidige versie blijft in de historiek.'))return;
  try{
   await api('/api/uniform-library/restore',{method:'POST',body:{key,versionId,reason}});
   await reload();await loadVersions(key);
   show('libraryUploadStatus','Vorige afbeeldingsversie hersteld.');
  }catch(e){show('libraryUploadStatus',e.message,true)}
 };
 function selection(){
  const department=ruleDept.value,kind=ruleKind.value,scope=ruleScope.value,
   selector=scope==='service'?'default':scope==='person'?
    (/^\d{15,22}$/.test(ruleTarget.value.trim())?ruleTarget.value.trim():
     ruleTarget.value.trim().startsWith('call_')?
      'call_'+normalize(ruleTarget.value.trim().slice(5)):''):
    normalize(ruleTarget.value);
  return {department,kind,scope,selector,assetCode:ruleAsset.value,
   reason:$('libraryAssignReason').value.trim()};
 }
 async function mutate(method){
  const data=selection();
  if(!data.selector||!data.reason||(method==='PUT'&&!data.assetCode))
   return show('libraryAssignStatus','Vul de doelgroep, afbeelding en motivering in.',true);
  try{
   await api('/api/uniform-library/rules',{method,body:data});
   await reload();
   show('libraryAssignStatus',method==='PUT'?'Afbeelding gekoppeld.':'Koppeling verwijderd.');
  }catch(e){show('libraryAssignStatus',e.message,true)}
 }
 $('libraryAssignSave').onclick=()=>mutate('PUT');
 $('libraryAssignRemove').onclick=()=>mutate('DELETE');
 $('libraryAssignmentRefresh').onclick=()=>reload().catch(e=>show('libraryAssignStatus',e.message,true));
 $('libraryFromUniformSelection').onclick=()=>{
  const d=$('uniformAssignDept'),s=$('uniformAssignScope'),t=$('uniformAssignTarget');
  if(!d||!s||!t||!t.value)return show('libraryAssignStatus','Kies hierboven eerst een persoon of graad bij Uniformtoewijzingen.',true);
  ruleDept.value=d.value;ruleScope.value=s.value;fillRuleTargets();ruleTarget.value=t.value;
  fillAssets();updateRules();show('libraryAssignStatus','Doelgroep overgenomen uit Uniformtoewijzingen.');
 };
 return {load:()=>reload().catch(e=>{
  show('libraryUploadStatus',e.message,true);
  show('libraryAssignStatus',e.message,true);
  return false;
 })};
}
