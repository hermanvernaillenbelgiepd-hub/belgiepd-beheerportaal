// Role artwork administration. Artworks are presentation-only, never Discord grants.
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
 ['1309532437977497700','instructeur','RAGO · Instructeur']
 ];
 const grades=[
 ['ap','Agent van Politie'],['aap','Aspirant-agent'],['1ap','Eerste agent'],
 ['ainp','Aspirant-inspecteur'],['inp','Inspecteur'],['1inp','Eerste inspecteur'],
 ['ahinp','Aspirant-hoofdinspecteur'],['hinp','Hoofdinspecteur'],
 ['1hinp','Eerste hoofdinspecteur'],['acp','Aspirant-commissaris'],
 ['cp','Commissaris'],['1cp','Eerste commissaris'],
 ['hcp','Hoofdcommissaris'],['1hcp','Eerste hoofdcommissaris']
 ];
 const specialties=[
 ['radio_bm','Radio BM'],['siv_wpr','SIV/WPR'],['signalisatie','Signalisatie'],
 ['motard','MOTARD / Motor'],['semi_ano','Semi-anoniem'],['k9','K-9'],
 ['rago','RAGO'],['disp','DISPATCH'],['to','TO'],['ae','AE'],
 ['recherche','Recherche'],['ehbo','EHBO'],['basis_tr','Basisopleiding'],
 ['medicatie','Medicatie'],['heli','MUG-HELI'],['mip','MIP'],
 ['ladderwagen','Ladderwagen'],['duiker','Duiker'],['fast','F.A.S.T.'],
 ['logistiek','Logistiek']
 ];
 const extraTypes=new Set(['medal','helmet','profession','logo','pictogram','patch','award']);
 const labels={role:'Discord-rol',rank:'Graad',specialty:'Specialisatie',uniform:'Uniform',
  medal:'Medaille',helmet:'Helm',profession:'Beroepsteken',logo:'Dienstlogo',
  pictogram:'Pictogram',patch:'Uniformpatch',award:'Ereteken'};
 const $p=id=>$(id);
 const kindSelect=$p('roleArtworkKind'),codePreset=$p('roleArtworkCodePreset');
 const badgeStyle=$p('roleArtworkBadgeStyle');
 const showKind=()=>{
  const role=kindSelect.value==='role';
  $p('roleArtworkPresetWrap').hidden=!role;
  $p('roleArtworkRoleIdWrap').hidden=!role;
  $p('roleArtworkVariantWrap').hidden=!role;
  $p('roleArtworkCodeWrap').hidden=role;
  $p('roleArtworkBadgeStyleWrap').hidden=kindSelect.value!=='specialty';
  codePreset.replaceChildren(new Option('Kies een bestaande optie of vul een code in',''));
  const known=kindSelect.value==='rank'?grades:
   kindSelect.value==='specialty'?specialties:[['default','Standaard voor deze hulpdienst']];
  if(!role)for(const [code,name] of known)codePreset.add(new Option(name,code));
 };
 kindSelect.onchange=()=>{badgeStyle.value='';showKind();configureCanvas();void setPreview('');void reload().catch(e=>message(e.message,true));};
 codePreset.onchange=()=>{
  const preset=(kindSelect.value==='rank'?grades:
   kindSelect.value==='specialty'?specialties:[['default','Standaard']]).find(x=>x[0]===codePreset.value);
  if(!preset)return;
  $p('roleArtworkCode').value=preset[0];
  $p('roleArtworkLabel').value=preset[1];
  void setPreview('');
 };
 showKind();
 const select=$p('roleArtworkPreset');
 select.append(new Option('Kies een bestaande rol of voer een nieuw ID in',''));
 presets.forEach(([roleId,variant,label])=>{
  const item=new Option(label,roleId+'|'+variant);select.append(item);
 });
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
  const size=nativeSize||(['medal','award'].includes(kind)?[320,400]:
   ['helmet','logo','profession','pictogram','patch'].includes(kind)?[320,320]:
   kind==='uniform'?[603,469]:[512,160]);
  canvas.width=size[0];canvas.height=size[1];
  canvas.style.aspectRatio=size[0]+'/'+size[1];
  const label=$p('roleArtworkFormatLabel');
  label.textContent='Voorbeeld ('+size[0]+' × '+size[1]+' px bronverhouding)';
  image.style.maxHeight='115px';
 }
 configureCanvas();
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
  kindSelect.value=row.kind||'role';
  showKind();configureCanvas();
  const styleMatch=row.kind==='specialty'?/^(.+)_(lokaal|federaal)$/.exec(row.code||''):null;
  badgeStyle.value=styleMatch?styleMatch[2]:'';
  $p('roleArtworkCode').value=styleMatch?styleMatch[1]:(row.code||'');
  codePreset.value=styleMatch?styleMatch[1]:(row.code||'');
  $p('roleArtworkRoleId').value=row.roleId||'';
  $p('roleArtworkDepartment').value=row.department||'politie';
  $p('roleArtworkVariant').value=row.variant||'standard';
  $p('roleArtworkLabel').value=row.label;
  select.value='';
  void setPreview(row.active?row.imageUrl:'').catch(e=>message('Afbeelding openen mislukt: '+e.message,true));
  $p('roleArtworkFile').value='';
  message('Geselecteerd: '+row.label+'. Je kunt nu een vervangende afbeelding uploaden.');
 }
 select.onchange=()=>{
  const preset=presets.find(p=>p[0]+'|'+p[1]===select.value);
  if(!preset)return;
  kindSelect.value='role';showKind();configureCanvas();
  $p('roleArtworkRoleId').value=preset[0];
  $p('roleArtworkDepartment').value='politie';
  $p('roleArtworkVariant').value=preset[1];
  $p('roleArtworkLabel').value=preset[2];
  setPreview('');
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
 async function reload(){
  const result=await api('/api/role-artwork/manage');
  list.replaceChildren();
  // This tab is dedicated to role and specialty artwork. Existing coats and
  // rank pictures remain preserved for personnel and the uniform studio.
  const visibleKinds=new Set(['role','specialty','logo','pictogram','patch']);
  const rows=(result.artworks||[]).filter(row=>visibleKinds.has(row.kind)&&row.kind===kindSelect.value);
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
  if(!rows.length)list.textContent='Geen afbeeldingen in deze categorie. Kies een andere soort of upload een nieuwe badge.';
 }
 const upload=$p('roleArtworkSave');
 upload.onclick=async()=>{
  if(busy)return;
  const roleId=$p('roleArtworkRoleId').value.trim(),variant=$p('roleArtworkVariant').value.trim();
  const kind=kindSelect.value;
  const codeBase=$p('roleArtworkCode').value.trim().toLowerCase();
  const code=kind==='specialty'&&badgeStyle.value?codeBase+'_'+badgeStyle.value:codeBase;
  const label=$p('roleArtworkLabel').value.trim(),reason=$p('roleArtworkReason').value.trim();
  const department=$p('roleArtworkDepartment').value;
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
  finally{busy=false;upload.disabled=false}
 };
 $p('roleArtworkReload').onclick=()=>reload().catch(e=>message(e.message,true));
 return {async load(){
  try{await reload();$p('roleArtworkSection').dataset.authorized='yes'}
  catch(e){$p('roleArtworkSection').dataset.authorized='no';message(e.message,true)}
 }};
}
