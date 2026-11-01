// UI for the central specialty-role-image mapping. Never changes Discord
// roles itself. Authorization and audit are enforced by server endpoints.
export function createSpecialtyLinksUI({api,notify,getDepartment,getPerson,selectedSpecialty}){
 const $=id=>document.getElementById(id);
 let config=null,draft=[],verified=null;
 const el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text||'';return x};
 const option=(value,label)=>{const x=el('option',label);x.value=value;return x};
 const select=(items,value)=>{const x=el('select');
  for(const [v,t] of items)x.append(option(v,t));
  x.value=value??'';return x};
 const codes=label=>{
  const raw=String(label||'').trim().toLowerCase();
  const alt={'motor':'motard','semi-ano.':'semi_ano','semi-anoniem':'semi_ano',
   'semi anoniem':'semi_ano','dispatch':'disp','radio bm':'radio_bm','siv/wpr':'wpr',
   'terreinondersteuner':'to','arrestatie-eenheid':'ae'};
  return alt[raw]||raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
 };
 const values=['Nee','Stage','Ja','Docent','Niet ingevuld','AANGEMELD',
  'RESTRICTED','ONTSLAG','INSTRUCTEUR','PLAVA','GPC','INACTIEF',
  'MUG-HELI','SPECIALISATIE','LEIDING','OPLEIDING!','GESCHORST','BLACKLISTED'];
 const setAvailable=(value)=>{
  $('specialtyLinkPanel').hidden=!value;
  $('specialtyLinkAdd').disabled=!value||!config?.canEdit;
  $('specialtyLinkSave').disabled=!value||!config?.canEdit;
 };
 function currentArtwork(label){
  const person=getPerson(),dept=getDepartment();
  const matched=verified?.matches?.find(x=>x.label===label&&x.assetKey)||
   draft.find(x=>x.label===label&&x.assetKey);
  const chosen=config?.assets?.find(x=>x.key===matched?.assetKey);
  if(chosen)return chosen;
  const code=codes(label);
  return config?.assets?.find(x=>x.key==='specialty_'+dept+'_'+code)||
   config?.assets?.find(x=>x.key==='patch_'+dept+'_'+code)||
   config?.assets?.find(x=>x.key==='specialty_'+dept+'_'+code+'_lokaal')||
   config?.assets?.find(x=>x.key==='specialty_'+dept+'_'+code+'_federaal')||null;
 }
 function updatePreview(){
  const label=selectedSpecialty();
  const image=currentArtwork(label),box=$('specialtyImage');
  box.hidden=!image;
  if(image){box.src=image.imageUrl;box.alt='Controle: '+image.label}
  $('specialtyImageName').textContent=image?'Afbeelding: '+image.label:
   'Nog geen patch gekoppeld. Controleer de specialisatie en status.';
  $('specialtyConfirmImage').checked=false;
 }
 function renderPersonList(items){
  const root=$('specialtyPersonList');root.replaceChildren();
  if(!Array.isArray(items))return;
  for(const spec of items){
   const tile=el('button');tile.type='button';tile.className='specialty-person-item';
   const info=el('span');
   info.append(el('strong',spec.label),el('small',
     String(spec.value||'Niet ingevuld')+' · '+(spec.source==='manual'?'Handmatig':'Geregistreerd')));
   tile.append(info);
   const pic=currentArtwork(spec.label);
   if(pic){
    const image=el('img');image.src=pic.imageUrl;image.alt='Patch '+pic.label;
    image.loading='lazy';tile.append(image);
   }
   if(spec.readOnly)tile.title='Alleen via geverifieerde Discord-rol';
   tile.onclick=()=>{
    const found=[...$('specialty').options].find(x=>x.value===spec.label);
    if(!found)return notify('Deze functie wordt uitsluitend via Discord geverifieerd.',true);
    $('specialty').value=spec.label;
    $('specialtyValue').value=spec.value;
    if(!$('specialtyValue').value)$('specialtyValue').value='Niet ingevuld';
    updatePreview();
    $('specialty').scrollIntoView({behavior:'smooth',block:'nearest'});
   };
   root.append(tile);
  }
 }
 function render(){
  const root=$('specialtyLinkRows');root.replaceChildren();
  setAvailable(Boolean(config));
  if(!config)return;
  $('specialtyLinkStatus').textContent=config.labels.length+' specialisaties · '+
   config.roles.length+' Discord-rollen in de dienstcatalogus · '+
   draft.length+' koppelingen'+(config.canEdit?' · bewerkbaar':' · alleen lezen');
  const roles=[['','Geen Discord-rol — handmatige specialisatie / patch'],
   ...config.roles.map(x=>[x.id,x.name+' · '+x.id])];
  const labels=config.labels.map(x=>[x,x]);
  const assets=[['','Geen afbeelding'],...config.assets.map(x=>[x.key,x.label+' · '+x.key])];
  for(const row of draft){
   const wrap=el('div');wrap.className='specialty-map-row';
   const field=(title,choices,key)=>{
    const group=el('label',title);
    const input=select(choices,row[key]);input.disabled=!config.canEdit;
    input.onchange=()=>{
     const previousRoleId=row.roleId;
     row[key]=input.value;
     if(key==='label'||key==='roleId'&&previousRoleId&&
       row.assetKey?.startsWith(previousRoleId+'_'))row.assetKey='';
     render();
    };
    group.append(input);wrap.append(group);
   };
   field('Specialisatie',labels,'label');
   field('Discord-rol (optioneel)',roles,'roleId');
   const level=el('label','Functieniveau');
   const levelInput=el('input');levelInput.value=row.level;levelInput.maxLength=45;
   levelInput.disabled=!config.canEdit;levelInput.placeholder='bv. Teamleader / Leiding';
   levelInput.oninput=()=>{row.level=levelInput.value};
   level.append(levelInput);wrap.append(level);
   field('Statusvoorstel',values.map(x=>[x,x]),'value');
   const patch=el('label','Patch uit Beeldbibliotheek');
   const patchChoice=select(assets,row.assetKey);patchChoice.disabled=!config.canEdit;
   patchChoice.onchange=()=>{row.assetKey=patchChoice.value;render()};
   patch.append(patchChoice);
   const preview=el('div');preview.className='specialty-map-preview';
   const asset=config.assets.find(x=>x.key===row.assetKey);
   if(asset){const img=el('img');img.src=asset.imageUrl;img.alt=asset.label;img.loading='lazy';
    preview.append(img)}
   else preview.textContent='Geen patch gekozen';
   if(row.assetKey&&/^\d{15,22}_/.test(row.assetKey)&&
      (!row.roleId||!row.assetKey.startsWith(row.roleId+'_')))
    preview.append(el('span','Deze oude patch hoort bij een andere Discord-rol. Kies een algemene patch.'));
   if(!row.roleId)preview.append(el('span',
     'Handmatig: geen Discord-rol nodig. Toekennen gebeurt per personeelsdossier.'));
   patch.append(preview);wrap.append(patch);
   const remove=el('button','Wissen');remove.type='button';remove.className='alt';
   remove.disabled=!config.canEdit;
   remove.onclick=()=>{draft=draft.filter(x=>x!==row);render()};
   wrap.append(remove);root.append(wrap);
  }
  updatePreview();
 }
 async function load(){
  const dept=getDepartment();config=null;draft=[];verified=null;
  setAvailable(false);
  try{
   const data=await api('/api/specialty-links/'+encodeURIComponent(dept));
   if(getDepartment()!==dept)return;
   config=data;draft=(data.links||[]).map(x=>({...x}));render();
   if(getPerson()?.dept===dept)void loadVerified(getPerson());
  }catch(e){
   $('specialtyLinkPanel').hidden=false;
   $('specialtyLinkStatus').textContent='Koppelingen niet beschikbaar: '+e.message;
   $('specialtyLinkRows').replaceChildren();
   $('specialtyLinkAdd').disabled=true;$('specialtyLinkSave').disabled=true;
  }
 }
 async function loadVerified(person){
  verified=null;$('specialtyVerified').hidden=true;
  if(!person||person.dept!==getDepartment()||!config)return;
  try{
   const data=await api('/api/specialty-links/'+encodeURIComponent(person.dept)+
    '/'+encodeURIComponent(person.discordId)+'/verified');
   if(getPerson()!==person)return;
   verified=data;
   const matches=data.matches||[];
   $('specialtyVerified').hidden=false;
   $('specialtyVerified').replaceChildren();
   $('specialtyVerified').append(el('strong',data.verified?
    'Geverifieerde Discord-specialisaties':'Discord-rollen niet recent geverifieerd'));
   const list=el('p',matches.length?matches.map(x=>
    x.label+' · '+(x.level||x.value)+' ('+x.roleId+')').join(' | '):
    'Geen rolkoppeling bevestigd. Een handmatige kwalificatie blijft afzonderlijk geregistreerd.');
   $('specialtyVerified').append(list);
   if(matches.length&&data.verified){
    const chosen=el('button','Geverifieerd niveau overnemen als voorstel');
    chosen.type='button';chosen.className='alt';
    chosen.onclick=()=>{
     const proposed=matches.find(x=>x.label===selectedSpecialty())||matches[0];
     const choice=[...$('specialty').options].find(x=>x.value===proposed.label);
     if(!choice)return notify('Deze rol heeft geen bewerkbare specialisatieregel.',true);
     $('specialty').value=proposed.label;
     $('specialtyValue').value=proposed.value;
     updatePreview();
     notify('Voorstel ingevuld: '+proposed.label+' → '+proposed.value+
      '. Een motivering en bevestiging blijven nodig; er is niets opgeslagen.');
    };
    $('specialtyVerified').append(chosen);
   }
   updatePreview();
  }catch(e){if(getPerson()===person){
    $('specialtyVerified').hidden=false;
    $('specialtyVerified').textContent='Discord-verificatie niet beschikbaar: '+e.message;
   }}
 }
 $('specialtyLinkAdd').onclick=()=>{
  if(!config?.canEdit||draft.length>=120)return;
  const label=config.labels.find(x=>!draft.some(item=>!item.roleId&&item.label===x));
  if(!label)return notify('Alle specialisaties hebben al een handmatige patchkoppeling.',true);
  draft.push({roleId:'',label,level:'Handmatig toegekend',value:'Ja',assetKey:''});
  render();
 };
 $('specialtyLinkSave').onclick=async()=>{
  if(!config?.canEdit)return;
  const reason=$('specialtyLinkReason').value.trim();
  if(reason.length<8||!$('specialtyLinkReviewed').checked)
   return notify('Vul een motivering in en bevestig de controle van rollen en afbeeldingen.',true);
  if(!confirm('Alle specialisatie- en patchkoppelingen voor '+getDepartment()+
    ' bewaren? Een Discord-rol is niet verplicht. Handmatige toekenningen '+
    'blijven per personeelslid.'))return;
  const b=$('specialtyLinkSave');b.disabled=true;
  try{
   await api('/api/specialty-links/'+encodeURIComponent(getDepartment()),'PUT',{
    expectedRevision:config.revision,links:draft,reason});
   $('specialtyLinkReviewed').checked=false;$('specialtyLinkReason').value='';
   notify('Koppelingen bewaard met auditlog. Geen Discord-rollen gewijzigd.');
   await load();
  }catch(e){notify(e.message,true)}
  finally{b.disabled=false}
 };
 return {load,loadVerified,updatePreview,renderPersonList};
}
