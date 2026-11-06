// Role artwork administration. Artworks are presentation-only, never Discord grants.
// Presentation-only service-specific choices; never proof of Discord permissions.
const ROLE_ART_ID=/^\d{15,22}$/;
const SERVICE_ART_CODES=Object.freeze({
 politie:[['radio_bm','Radio BM'],['siv_wpr','SIV/WPR'],['burgermeldingen','Burgermeldingen'],['terreinondersteuner','Terreinondersteuner'],['signalisatie','Signalisatie'],['motard','MOTARD / Motor'],['semi_ano','Semi-anoniem'],['k9','K-9'],['rago','RAGO'],['disp','DISPATCH'],['to','TO'],['ae','AE'],['recherche','Recherche'],['ehbo','EHBO'],['basis_tr','Basisopleiding']],
 brandweer:[['signalisatie','Signalisatie'],['ladderwagen','Ladderwagen'],['duiker','Duiker'],['boswagen','Boswagen'],['bosbestrijding','Bosbestrijding'],['grote_boot','Grote boot'],['logistiek','Logistiek'],['gevaarlijke_stoffen','Gevaarlijke stoffen'],['red_team','RED-team'],['overige_leden','Overige leden'],['basis_tr','Basistraining']],
 ambulance:[['mug_heli','MUG-HELI'],['heli','HELI'],['pit','PIT'],['pit_motor','PIT-MOTOR'],['mip','MIP'],['medicatie','Medicatie'],['verpleegkundige','Verpleegkundige'],['arts','Arts'],['amb','Ambulancier'],['medisch_instructeur','Medisch instructeur']],
 depannage:[['lsra','LSRA'],['fast','F.A.S.T.'],['crane','CRANE'],['awv','AWV']],
 burger:[['burger_io','Burger IO'],['burger','Burger'],['burgerraad','Burgerraad']],
 beveiliging:[]
});
export function roleArtworkChoices(department,catalog=[],artworks=[],policePresets=[]){
 const choices=new Map();
 const add=(id,variant,label)=>{
  if(!ROLE_ART_ID.test(String(id||''))||!/^[a-z][a-z0-9_]{0,39}$/.test(String(variant||'')))return;
  const key=id+'|'+variant;
  if(!choices.has(key))choices.set(key,{roleId:id,variant,label:String(label||id).slice(0,90)});
 };
 for(const role of catalog){
  if(!role||typeof role!=='object')continue;
  if(role.dept!==department&&!(department==='politie'&&role.dept==='dispatch'))continue;
  add(role.id,'standard',role.name);
 }
 if(department==='politie')for(const [id,variant,label] of policePresets)add(id,variant,label);
 for(const row of artworks){
  if(!row||row.department!==department||row.kind!=='role')continue;
  add(row.roleId,row.variant||'standard',row.label);
 }
 return [...choices.values()].sort((a,b)=>a.label.localeCompare(b.label,'nl-BE')||
  a.roleId.localeCompare(b.roleId));
}
export function artworkCodeChoices(department,kind,artworks=[]){
 const codes=new Map((SERVICE_ART_CODES[department]||[]).map(([code,label])=>[code,label]));
 for(const row of artworks){
  if(!row||row.department!==department||!['specialty','patch'].includes(row.kind))continue;
  const base=String(row.code||'').replace(/_(?:lokaal|federaal)$/,'');
  if(/^[a-z0-9][a-z0-9_]{0,39}$/.test(base)&&!codes.has(base))
   codes.set(base,String(row.label||base).slice(0,75));
 }
 return [...codes].sort((a,b)=>a[1].localeCompare(b[1],'nl-BE'));
}
export function setupRoleArtworkUI({api,$,notice}){
 const presets=[
 ['1345302115689431061','standard','K-9 · Instructeur'],
 ['1309532437977497699','standard','K-9 · Geleider'],
 ['1345297414612979713','standard','K-9 · Geleider in stage'],
 ['1359656762289946755','standard','MOTARD · Instructeur'],
 ['1358148694297415741','standard','MOTARD · Volwaardig'],
 ['1365602771855740958','standard','MOTARD · In opleiding'],
 ['1393050971604516904','standard','DISP · Instructeur'],
 ['1309532438019706963','standard','DISP · Volwaardig'],
 ['1337852029611016233','standard','DISP · Selectie / in opleiding'],
 ['1490841316656156802','standard','RAGO · In opleiding'],
 ['1309532437977497700','standard','RAGO · Volwaardig'],
 ['1393050551188721865','standard','RAGO · Instructeur'],
 ['1309542190409580594','standard','AE · AE-I'],
 ['1310674604821581894','standard','AE · AE-T'],
 ['1337775768083632158','standard','AE · Teamleader'],
 ['1337156006597103746','standard','AE · Instructeur'],
 ['1309532438019706962','standard','Terreinondersteuner']
 ];
 const grades=[
 ['ap','Agent van Politie'],['aap','Aspirant-agent'],['1ap','Eerste agent'],
 ['ainp','Aspirant-inspecteur'],['inp','Inspecteur'],['1inp','Eerste inspecteur'],
 ['ahinp','Aspirant-hoofdinspecteur'],['hinp','Hoofdinspecteur'],
 ['1hinp','Eerste hoofdinspecteur'],['acp','Aspirant-commissaris'],
 ['cp','Commissaris'],['1cp','Eerste commissaris'],
 ['hcp','Hoofdcommissaris'],['1hcp','Eerste hoofdcommissaris']
 ];
 const extraTypes=new Set(['medal','helmet','profession','logo','pictogram','patch','award']);
 const labels={role:'Discord-rol',rank:'Graad',specialty:'Specialisatie',uniform:'Uniform',
  medal:'Medaille',helmet:'Helm',profession:'Beroepsteken',logo:'Dienstlogo',
  pictogram:'Pictogram',patch:'Uniformpatch',award:'Ereteken'};
 const $p=id=>$(id);
 const kindSelect=$p('roleArtworkKind'),codePreset=$p('roleArtworkCodePreset');
 const badgeStyle=$p('roleArtworkBadgeStyle'),departmentSelect=$p('roleArtworkDepartment');
 const select=$p('roleArtworkPreset');
 let catalogRoles=[],savedArtworks=[],editableDepartments=[];
 const knownCodes=()=>kindSelect.value==='rank'?
  (departmentSelect.value==='politie'?grades:[]):
  ['specialty','patch'].includes(kindSelect.value)?
   artworkCodeChoices(departmentSelect.value,kindSelect.value,savedArtworks):
   [['default','Standaard voor deze hulpdienst']];
 const refreshRoleChoices=()=>{
  const previous=select.value;
  select.replaceChildren(new Option('Kies een bestaande dienstrol of voer een rol-ID in',''));
  for(const item of roleArtworkChoices(departmentSelect.value,catalogRoles,savedArtworks,presets))
   select.add(new Option(item.label,item.roleId+'|'+item.variant));
  if([...select.options].some(option=>option.value===previous))select.value=previous;
 };
 const showKind=()=>{
  const role=kindSelect.value==='role';
  $p('roleArtworkPresetWrap').hidden=!role;
  $p('roleArtworkRoleIdWrap').hidden=!role;
  $p('roleArtworkVariantWrap').hidden=!role;
  $p('roleArtworkCodeWrap').hidden=role;
  $p('roleArtworkBadgeStyleWrap').hidden=kindSelect.value!=='specialty';
  codePreset.replaceChildren(new Option('Kies een bestaande optie of vul een code in',''));
  const known=knownCodes();
  if(!role)for(const [code,name] of known)codePreset.add(new Option(name,code));
 };
 kindSelect.onchange=()=>{badgeStyle.value='';showKind();configureCanvas();void setPreview('');void reload().catch(e=>message(e.message,true));};
 codePreset.onchange=()=>{
  const preset=knownCodes().find(x=>x[0]===codePreset.value);
  if(!preset)return;
  $p('roleArtworkCode').value=preset[0];
  $p('roleArtworkLabel').value=preset[1];
  void setPreview('');configureCanvas();
 };
 showKind();
 refreshRoleChoices();
 let previewData='',busy=false,sourceImage=null,ownedObjectUrl='',loadRevision=0;
 let offsetX=0,offsetY=0,dragging=null;
 const message=(t,bad=false)=>{
  const el=$p('roleArtworkStatus');el.textContent=t;el.classList.toggle('error',bad);
 };
 const image=$p('roleArtworkPreview');
 const cropSection=$p('roleArtworkCropSection');
 const canvas=$p('roleArtworkCropCanvas'),ctx=canvas.getContext('2d',{alpha:true});
 function configureCanvas(){
  const kind=kindSelect.value;
  const nativeSize=sourceImage&&kind==='uniform'?(()=>{
   const limit=Math.min(1,1200/Math.max(sourceImage.naturalWidth,sourceImage.naturalHeight),
    Math.sqrt(1200000/(sourceImage.naturalWidth*sourceImage.naturalHeight)));
   return [Math.max(1,Math.round(sourceImage.naturalWidth*limit)),
    Math.max(1,Math.round(sourceImage.naturalHeight*limit))];
  })():null;
  const widePatch=(kind==='patch'&&['politie','depannage'].includes($p('roleArtworkDepartment').value))||
   (kind==='specialty'&&$p('roleArtworkDepartment').value==='depannage');
  const size=nativeSize||(widePatch?[640,200]:
   ['medal','award'].includes(kind)?[320,400]:
   ['helmet','logo','profession','pictogram','patch'].includes(kind)?[320,320]:
   kind==='uniform'?[603,469]:
   kind==='specialty'&&$p('roleArtworkDepartment').value==='brandweer'&&
    $p('roleArtworkCode').value.trim().toLowerCase()==='duiker'?[320,149]:
   kind==='specialty'&&$p('roleArtworkDepartment').value==='brandweer'?[320,320]:
   kind==='specialty'&&$p('roleArtworkDepartment').value==='ambulance'?[320,320]:
   [512,160]);
  canvas.width=size[0];canvas.height=size[1];
  canvas.style.aspectRatio=size[0]+'/'+size[1];
  const label=$p('roleArtworkFormatLabel');
  label.textContent='Voorbeeld ('+size[0]+' × '+size[1]+' px bronverhouding)';
  image.style.maxHeight='115px';
 }
 configureCanvas();
 $p('roleArtworkCode').addEventListener('change',()=>{
  if(kindSelect.value!=='specialty')return;
  configureCanvas();
  if(sourceImage)renderCrop();
 });
 departmentSelect.addEventListener('change',()=>{
  // Clear the former service's ID, code and name before loading the new one.
  select.value='';
  $p('roleArtworkRoleId').value='';
  $p('roleArtworkCode').value='';
  $p('roleArtworkLabel').value='';
  $p('roleArtworkVariant').value='standard';
  badgeStyle.value='';
  showKind();refreshRoleChoices();configureCanvas();void setPreview('');
  void reload().catch(e=>message(e.message,true));
 });
 const zoom=$p('roleArtworkZoom'),zoomValue=$p('roleArtworkZoomValue');
 const fit=$p('roleArtworkFit');
 canvas.tabIndex=0;
 const defaultFit=()=>kindSelect.value!=='role'&&kindSelect.value!=='uniform'&&kindSelect.value!=='rank'?'contain':'cover';
 function clearPreview(){
  loadRevision++;
  if(ownedObjectUrl){URL.revokeObjectURL(ownedObjectUrl);ownedObjectUrl=''}
  sourceImage=null;dragging=null;previewData='';
  offsetX=offsetY=0;
  image.hidden=true;image.removeAttribute('src');
  cropSection.hidden=true;
  ctx?.clearRect(0,0,canvas.width,canvas.height);
 }
 function renderCrop(){
  if(!sourceImage||!ctx)return;
  const width=canvas.width,height=canvas.height;
  ctx.clearRect(0,0,width,height);
  const sx=width/sourceImage.naturalWidth,sy=height/sourceImage.naturalHeight;
  const base=fit.value==='contain'?Math.min(sx,sy):Math.max(sx,sy);
  const scale=base*Number(zoom.value)/100;
  const w=sourceImage.naturalWidth*scale,h=sourceImage.naturalHeight*scale;
  ctx.drawImage(sourceImage,(width-w)/2+offsetX,(height-h)/2+offsetY,w,h);
  zoomValue.value=String(zoom.value)+'%';
  zoomValue.textContent=zoomValue.value;
  // The thumbnail is a faithful preview of the saved pixels, not a CSS zoom.
  previewData='';
  for(const quality of [.9,.77,.6,.45]){
   const encoded=canvas.toDataURL('image/webp',quality);
   if(encoded.startsWith('data:image/webp;base64,')&&encoded.length<180000){
    previewData=encoded;break;
   }
  }
  image.src=previewData||canvas.toDataURL('image/png');
  image.hidden=false;
 }
 async function setPreview(src='',asObjectUrl=false){
  clearPreview();
  if(!src)return;
  const revision=loadRevision;
  if(asObjectUrl)ownedObjectUrl=src;
  const loaded=new Image();
  loaded.decoding='async';
  loaded.src=src;
  try{
   await loaded.decode();
   if(revision!==loadRevision)return;
   if(!loaded.naturalWidth||!loaded.naturalHeight||
    loaded.naturalWidth>8192||loaded.naturalHeight>8192)
    throw Error('De afbeelding is te groot of kan niet worden gelezen.');
   sourceImage=loaded;
   configureCanvas();
   zoom.value='100';fit.value=defaultFit();
   offsetX=offsetY=0;
   cropSection.hidden=false;
   renderCrop();
  }catch(e){
   if(revision===loadRevision)clearPreview();
   throw e;
  }
 }
 // Pointer dragging works with mouse, touch and stylus; coordinates are
 // converted from responsive CSS size back to the 512 × 160 pixel crop.
 canvas.addEventListener('pointerdown',e=>{
  if(!sourceImage||e.button>0)return;
  dragging={id:e.pointerId,x:e.clientX,y:e.clientY};
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!dragging||dragging.id!==e.pointerId||!sourceImage)return;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  offsetX+=(e.clientX-dragging.x)*canvas.width/rect.width;
  offsetY+=(e.clientY-dragging.y)*canvas.height/rect.height;
  dragging.x=e.clientX;dragging.y=e.clientY;
  renderCrop();e.preventDefault();
 });
 const stopDrag=e=>{if(dragging?.id===e.pointerId)dragging=null;};
 canvas.addEventListener('pointerup',stopDrag);
 canvas.addEventListener('pointercancel',stopDrag);
 canvas.addEventListener('lostpointercapture',stopDrag);
 canvas.addEventListener('keydown',e=>{
  if(!sourceImage)return;
  const step=e.shiftKey?18:4;
  switch(e.key){
   case 'ArrowLeft':offsetX-=step;break;
   case 'ArrowRight':offsetX+=step;break;
   case 'ArrowUp':offsetY-=step;break;
   case 'ArrowDown':offsetY+=step;break;
   default:return;
  }
  e.preventDefault();renderCrop();
 });
 zoom.addEventListener('input',renderCrop);
 fit.addEventListener('change',()=>{offsetX=offsetY=0;renderCrop()});
 $p('roleArtworkCropReset').addEventListener('click',()=>{
  zoom.value='100';fit.value=defaultFit();offsetX=offsetY=0;renderCrop();
 });
 canvas.addEventListener('wheel',e=>{
  if(!sourceImage)return;
  e.preventDefault();
  const step=e.deltaY<0?10:-10;
  zoom.value=String(Math.max(Number(zoom.min),
   Math.min(Number(zoom.max),Number(zoom.value)+step)));
  renderCrop();
 },{passive:false});
 const list=$p('roleArtworkList');
 function selectItem(row){
  departmentSelect.value=row.department||'politie';
  kindSelect.value=row.kind||'role';
  showKind();refreshRoleChoices();configureCanvas();
  const styleMatch=row.kind==='specialty'?/^(.+)_(lokaal|federaal)$/.exec(row.code||''):null;
  badgeStyle.value=styleMatch?styleMatch[2]:'';
  $p('roleArtworkCode').value=styleMatch?styleMatch[1]:(row.code||'');
  codePreset.value=styleMatch?styleMatch[1]:(row.code||'');
  $p('roleArtworkRoleId').value=row.roleId||'';
  configureCanvas();
  $p('roleArtworkVariant').value=row.variant||'standard';
  select.value=row.kind==='role'?row.roleId+'|'+(row.variant||'standard'):'';
  $p('roleArtworkLabel').value=row.label;
  select.value='';
  void setPreview(row.active?row.imageUrl:'').catch(e=>message('Afbeelding openen mislukt: '+e.message,true));
  $p('roleArtworkFile').value='';
  message('Geselecteerd: '+row.label+'. Je kunt nu een vervangende afbeelding uploaden.');
 }
 select.onchange=()=>{
  const item=roleArtworkChoices(departmentSelect.value,catalogRoles,savedArtworks,presets)
   .find(x=>x.roleId+'|'+x.variant===select.value);
  if(!item)return;
  kindSelect.value='role';showKind();configureCanvas();
  $p('roleArtworkRoleId').value=item.roleId;
  $p('roleArtworkVariant').value=item.variant;
  $p('roleArtworkLabel').value=item.label;
  void setPreview('');
 };
 $p('roleArtworkFile').onchange=async()=>{
  const file=$p('roleArtworkFile').files?.[0];
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){
   clearPreview();message('Kies een PNG, JPG of WebP (geen SVG).',true);return;
  }
  if(file.size>5*1024*1024){
   clearPreview();message('Bronbestand is groter dan 5 MB.',true);return;
  }
  const src=URL.createObjectURL(file);
  try{
   await setPreview(src,true);
   message('Sleep het logo en kies de grootte. Het kleine voorbeeld toont het uiteindelijke resultaat. Daarna kun je opslaan.');
  }catch(e){message('Afbeelding openen mislukt: '+e.message,true)}
 };
 let activeReload=0;
 async function reload(){
  const revision=++activeReload;
  const result=await api('/api/role-artwork/manage');
  if(revision!==activeReload)return;
  savedArtworks=Array.isArray(result.artworks)?result.artworks:[];
  catalogRoles=Array.isArray(result.roleOptions)?result.roleOptions:[];
  editableDepartments=Array.isArray(result.editableDepartments)?result.editableDepartments:[];
  showKind();refreshRoleChoices();
  list.replaceChildren();
  // This tab is dedicated to role and specialty artwork. Existing coats and
  // rank pictures remain preserved for personnel and the uniform studio.
  const visibleKinds=new Set(['role','specialty','logo','pictogram','patch']);
  const department=departmentSelect.value;
  const rows=savedArtworks.filter(row=>visibleKinds.has(row.kind)&&
   row.kind===kindSelect.value&&row.department===department);
  const canEdit=editableDepartments.includes(department);
  $p('roleArtworkSave').disabled=!canEdit;
  if(!canEdit)message('Geen upload- of wijzigingsrechten voor '+department+
   '. Alleen Officierenkader of Korpsleiding van deze hulpdienst (of Technisch Beheer) kan dit aanpassen.',true);
  $p('roleArtworkCount').textContent=rows.length+' '+(labels[kindSelect.value]||'logo')+'-afbeelding(en)';
  for(const row of rows){
   const card=document.createElement('div');card.className='artwork-item';
   const pic=document.createElement('img');pic.alt=row.label;pic.loading='lazy';
   if(row.active)pic.src=row.imageUrl;
   const body=document.createElement('div');
   const name=document.createElement('strong');name.textContent=row.label;
   const details=document.createElement('small');
   details.textContent=(row.department||'politie').toUpperCase()+' · '+(row.kind==='role'?row.roleId+' · '+row.variant:(labels[row.kind]||row.kind)+' · '+row.code)+' · '+(row.active?'ACTIEF':'NIET ACTIEF');
   body.append(name,details);
   const btn=document.createElement('button');btn.type='button';btn.className='alt';btn.textContent='Bewerken';
   btn.onclick=()=>selectItem(row);
   const off=document.createElement('button');off.type='button';off.className='danger';off.textContent='Deactiveren';
   off.disabled=!row.active;
   off.onclick=async()=>{
    const reason=$p('roleArtworkReason').value.trim();
    if(reason.length<8){message('Vul eerst een motivering van minstens 8 tekens in.',true);return}
    if(!confirm('Het opgeslagen logo voor '+row.label+' deactiveren? Het standaardplaatje blijft dan zichtbaar.'))return;
    off.disabled=true;
    try{await api('/api/role-artwork/'+encodeURIComponent(row.key),{method:'DELETE',body:{reason}});
     message('Logo gedeactiveerd. Het standaardplaatje wordt opnieuw gebruikt.');await reload();
    }catch(e){message(e.message,true);off.disabled=false}
   };
   card.append(pic,body,btn,off);list.append(card);
  }
  if(!rows.length)list.textContent='Nog geen '+(labels[kindSelect.value]||'logo')+
   '-afbeeldingen voor '+department+'. Kies een beschikbare rol of upload een nieuwe badge.';
 }
 const upload=$p('roleArtworkSave');
 upload.onclick=async()=>{
  if(busy)return;
  const roleId=$p('roleArtworkRoleId').value.trim(),variant=$p('roleArtworkVariant').value.trim();
  const kind=kindSelect.value;
  const codeBase=$p('roleArtworkCode').value.trim().toLowerCase();
  const code=kind==='specialty'&&badgeStyle.value?codeBase+'_'+badgeStyle.value:codeBase;
  const label=$p('roleArtworkLabel').value.trim(),reason=$p('roleArtworkReason').value.trim();
  const department=departmentSelect.value;
  if(!editableDepartments.includes(department)){
   message('Je hebt geen logobeheerrechten voor '+department+'.',true);return;
  }
  if(kind==='role'){
   if(!/^\d{15,22}$/.test(roleId)||!/^[a-z][a-z0-9_]{0,39}$/.test(variant)){
    message('Geef een geldig Discord-rol-ID en variant op.',true);return;
   }
  }else if(!['rank','specialty','uniform',...extraTypes].includes(kind)||!/^[a-z0-9][a-z0-9_]{0,39}$/.test(code)){
   message('Kies een onderdeel en een geldige korte code (max. 40 tekens inclusief lokaal/federaal).',true);return;
  }
  if(!previewData.startsWith('data:image/webp;base64,')){message('Selecteer eerst een nieuwe afbeelding om te uploaden.',true);return}
  if(reason.length<8){message('Geef een motivering van minstens 8 tekens.',true);return}
  busy=true;upload.disabled=true;
  try{
   const endpoint=kind==='role'?'/api/role-artwork':'/api/role-artwork/personnel';
   const body=kind==='role'?{roleId,variant,department,label,reason,dataUrl:previewData}:
    {kind,code,department,label,reason,dataUrl:previewData};
   await api(endpoint,{method:'PUT',body});
   message('Logo opgeslagen in Firebase. Het is meteen beschikbaar in het portaal.');
   $p('roleArtworkFile').value='';await setPreview('');
   await reload();
  }catch(e){message('Opslaan mislukt: '+e.message,true)}
  finally{busy=false;upload.disabled=!editableDepartments.includes(departmentSelect.value)}
 };
 $p('roleArtworkReload').onclick=()=>reload().catch(e=>message(e.message,true));
 return {async load(){
  try{await reload();$p('roleArtworkSection').dataset.authorized='yes'}
  catch(e){$p('roleArtworkSection').dataset.authorized='no';message(e.message,true)}
 }};
}
