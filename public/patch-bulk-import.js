// The one-click BelgiumPD patch importer keeps the user's authenticated Firebase
// session and uses the existing audited endpoints. It never mutates Discord roles.
export function setupPatchBulkImport({root,api,notify,canUpload,cloudReady,afterUpload}){
 const roleNames={
 '1345297414612979713':'K-9 · Geleider in stage',
 '1309532437977497699':'K-9 · Geleider',
 '1345302115689431061':'K-9 · Instructeur',
 '1365602771855740958':'MOTARD · In opleiding',
 '1358148694297415741':'MOTARD · Volwaardig',
 '1359656762289946755':'MOTARD · Instructeur',
 '1337852029611016233':'DISPATCH · Selectie',
 '1309532438019706963':'DISPATCH · Volwaardig',
 '1393050971604516904':'DISPATCH · Instructeur',
 '1309542190409580594':'ARRESTATIE-EENHEID · AE-I',
 '1310674604821581894':'ARRESTATIE-EENHEID · AE-T',
 '1337775768083632158':'ARRESTATIE-EENHEID · Teamleader',
 '1337156006597103746':'ARRESTATIE-EENHEID · Instructeur',
 '1490841316656156802':'RAGO · Halve wing (in opleiding)',
 '1309532437977497700':'RAGO · Volledige wing',
 '1393050551188721865':'RAGO · Instructeur',
 '1309532438019706962':'TERREINONDERSTEUNER'
 };
 const neutral={
 k9:'K-9',motard:'MOTARD',disp:'DISPATCH',ae:'ARRESTATIE-EENHEID',
 rago:'RAGO',terreinondersteuner:'TERREINONDERSTEUNER',
 burgermeldingen:'BURGERMELDINGEN',signalisatie:'SIGNALISATIE',
 semi_ano:'SEMI-ANONIEM'
 };
 const input=root.querySelector('[data-patches-input]');
 const preview=root.querySelector('[data-patches-preview]');
 const save=root.querySelector('[data-patches-save]');
 const status=root.querySelector('[data-patches-status]');
 const reason=root.querySelector('[data-patches-reason]');
 let selected=[];
 const parseName=name=>{
  const stem=String(name).replace(/\.webp$/i,'');
  const role=/^(\d{15,22})_standard$/.exec(stem);
  if(role&&roleNames[role[1]])return {
   filename:name,kind:'role',roleId:role[1],variant:'standard',
   label:roleNames[role[1]],department:'politie'
  };
  const patch=/^specialty_politie_([a-z0-9_]{1,40})$/.exec(stem);
  if(patch&&neutral[patch[1]])return {
   filename:name,kind:'specialty',code:patch[1],
   label:neutral[patch[1]],department:'politie'
  };
  return null;
 };
 const fileData=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||''));
  reader.onerror=()=>reject(Error('Afbeelding kan niet gelezen worden'));
  reader.readAsDataURL(file);
 });
 const list=()=>{
  preview.replaceChildren();
  if(!selected.length){status.textContent='Kies de uitgepakte WebP-bestanden.';save.disabled=true;return}
  const valid=selected.filter(x=>!x.error);
  const errors=selected.filter(x=>x.error);
  status.textContent=valid.length+' herkende bestanden, '+errors.length+
   ' overgeslagen. Alleen expliciet gekende BelgiumPD-afbeeldingen worden geïmporteerd.';
  for(const item of selected){
   const li=document.createElement('li');
   li.textContent=(item.error?'✕ '+item.error:'✓ '+item.meta.label+' → '+item.meta.filename);
   preview.append(li);
  }
  save.disabled=!valid.length||!canUpload();
 };
 input.onchange=()=>{
  const all=[...input.files||[]];
  const seen=new Set();
  selected=all.map(file=>{
   const meta=parseName(file.name);
   const key=meta?.kind==='role'?meta.roleId+'_standard':meta?'specialty_politie_'+meta.code:'';
   let error=null;
   if(!meta)error=file.name+' is geen gekende rol- of neutrale specialisatiepatch';
   else if(seen.has(key))error=file.name+' komt dubbel voor';
   else if(file.size>140*1024||file.size<40)error=file.name+' is groter dan 140 KB of leeg';
   else if(!/\.webp$/i.test(file.name))error=file.name+' is geen WebP';
   if(key)seen.add(key);
   return {file,meta,error};
  });
  list();
 };
 save.onclick=async()=>{
  const motivation=reason.value.trim();
  if(motivation.length<8||motivation.length>300){
   notify('Geef een motivering van minstens 8 tekens.',true);return;
  }
  if(!canUpload()){notify('Je hebt geen bibliotheekrechten voor Politie.',true);return}
  const valid=selected.filter(x=>!x.error);
  if(!valid.length)return;
  if(!window.confirm(valid.length+' afbeeldingen importeren of vervangen in de Politiebibliotheek? '+ 
    'De bestaande afbeeldingsversies blijven in de audit beschikbaar. Geen Discord-rechten worden gewijzigd.'))return;
  save.disabled=true;input.disabled=true;
  let saved=0,errors=[];
  try{
   for(const item of valid){
    try{
     status.textContent='Upload '+(saved+errors.length+1)+' / '+valid.length+': '+item.meta.label;
     // Browsers may label a .webp as octet-stream. The server still validates
     // the RIFF/WEBP bytes, so normalizing the data-URL MIME is safe here.
     const dataUrl=(await fileData(item.file)).replace(
       /^data:[^;]*;base64,/, 'data:image/webp;base64,');
     const meta=item.meta;
     const payload=meta.kind==='role'?
      {department:'politie',roleId:meta.roleId,variant:'standard',label:meta.label,
       reason:motivation,dataUrl}:
      {department:'politie',kind:'specialty',code:meta.code,label:meta.label,
       reason:motivation,dataUrl};
     const endpoint=meta.kind==='role'?'/api/role-artwork':
      cloudReady()?'/api/uniform-library/assets':'/api/role-artwork/personnel';
     await api(endpoint,'PUT',payload);
     saved++;
    }catch(error){errors.push(item.file.name+': '+error.message)}
   }
   status.textContent=saved+' afbeeldingen opgeslagen, '+errors.length+' fouten.'+
    (errors.length?' '+errors.slice(0,6).join(' | '):'');
   notify(saved+' patch(es) opgeslagen in de bibliotheek'+
    (errors.length?'; '+errors.length+' niet opgeslagen. Controleer de lijst.':'.'),
    Boolean(errors.length));
   if(saved)await afterUpload();
  }finally{save.disabled=false;input.disabled=false}
 };
 list();
 return {refresh:list};
}
