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
 const $p=id=>$(id);
 const select=$p('roleArtworkPreset');
 select.append(new Option('Kies een bestaande rol of voer een nieuw ID in',''));
 presets.forEach(([roleId,variant,label])=>{
  const item=new Option(label,roleId+'|'+variant);select.append(item);
 });
 let previewData='',busy=false;
 const message=(t,bad=false)=>{const el=$p('roleArtworkStatus');el.textContent=t;el.classList.toggle('error',bad)};
 const image=$p('roleArtworkPreview');
 const setPreview=data=>{
  previewData=data;
  image.hidden=!data;image.src=data||'';
 };
 const list=$p('roleArtworkList');
 function selectItem(row){
  $p('roleArtworkRoleId').value=row.roleId;
  $p('roleArtworkDepartment').value=row.department||'politie';
  $p('roleArtworkVariant').value=row.variant;
  $p('roleArtworkLabel').value=row.label;
  select.value='';
  setPreview(row.active?row.imageUrl:'');
  $p('roleArtworkFile').value='';
  message('Geselecteerd: '+row.label+'. Je kunt nu een vervangende afbeelding uploaden.');
 }
 select.onchange=()=>{
  const preset=presets.find(p=>p[0]+'|'+p[1]===select.value);
  if(!preset)return;
  $p('roleArtworkRoleId').value=preset[0];
  $p('roleArtworkDepartment').value='politie';
  $p('roleArtworkVariant').value=preset[1];
  $p('roleArtworkLabel').value=preset[2];
  setPreview('');
 };
 async function convert(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))
   throw Error('Kies een PNG, JPG of WebP (geen SVG).');
  if(file.size>5*1024*1024)throw Error('Bronbestand is groter dan 5 MB.');
  const blob=URL.createObjectURL(file);
  try{
   const img=new Image();
   img.src=blob;await img.decode();
   if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth>8192||img.naturalHeight>8192)
    throw Error('Afbeelding te groot of beschadigd.');
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Afbeeldingsverwerking niet beschikbaar.');
   // Transparent background remains transparent; center crop to K9's 16:5.
   const scale=Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight);
   const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
   ctx.drawImage(img,(512-w)/2,(160-h)/2,w,h);
   let data='';
   for(const quality of [.9,.75,.55]){
    data=canvas.toDataURL('image/webp',quality);
    if(data.startsWith('data:image/webp;base64,')&&data.length<180000)break;
   }
   if(!data.startsWith('data:image/webp;base64,')||data.length>=180000)
    throw Error('De afbeelding kan niet veilig naar WebP (max. 140 KB) worden omgezet.');
   return data;
  }finally{URL.revokeObjectURL(blob)}
 }
 $p('roleArtworkFile').onchange=async()=>{
  const file=$p('roleArtworkFile').files?.[0];
  if(!file)return;
  try{setPreview(await convert(file));message('Voorbeeld klaar (170 × 53,125 px op de site). Klik Opslaan om te publiceren.')}
  catch(e){setPreview('');message(e.message,true)}
 };
 async function reload(){
  const result=await api('/api/role-artwork/manage');
  list.replaceChildren();
  const rows=result.artworks||[];
  $p('roleArtworkCount').textContent=rows.length+' opgeslagen logo(s)';
  for(const row of rows){
   const card=document.createElement('div');card.className='artwork-item';
   const pic=document.createElement('img');pic.alt=row.label;pic.loading='lazy';
   if(row.active)pic.src=row.imageUrl;
   const body=document.createElement('div');
   const name=document.createElement('strong');name.textContent=row.label;
   const details=document.createElement('small');
   details.textContent=(row.department||'politie').toUpperCase()+' · '+row.roleId+' · '+row.variant+' · '+(row.active?'ACTIEF':'NIET ACTIEF');
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
  if(!rows.length)list.textContent='Nog geen logo’s opgeslagen. Upload je eerste logo hierboven.';
 }
 const upload=$p('roleArtworkSave');
 upload.onclick=async()=>{
  if(busy)return;
  const roleId=$p('roleArtworkRoleId').value.trim(),variant=$p('roleArtworkVariant').value.trim();
  const label=$p('roleArtworkLabel').value.trim(),reason=$p('roleArtworkReason').value.trim();
  const department=$p('roleArtworkDepartment').value;
  if(!/^\d{15,22}$/.test(roleId)||!/^[a-z][a-z0-9_]{0,39}$/.test(variant)){
   message('Geef een geldig Discord-rol-ID en variant op.',true);return;
  }
  if(!previewData.startsWith('data:image/webp;base64,')){message('Selecteer eerst een nieuwe afbeelding om te uploaden.',true);return}
  if(reason.length<8){message('Geef een motivering van minstens 8 tekens.',true);return}
  busy=true;upload.disabled=true;
  try{
   await api('/api/role-artwork',{method:'PUT',body:{roleId,variant,department,label,reason,dataUrl:previewData}});
   message('Logo opgeslagen in Firebase. Het is meteen beschikbaar in het portaal.');
   $p('roleArtworkFile').value='';setPreview('');
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
