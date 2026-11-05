// UI for the central specialty-role-image mapping. Never changes Discord
// roles itself. Authorization and audit are enforced by server endpoints.
export function createSpecialtyLinksUI({api,notify,getDepartment,getPerson,selectedSpecialty}){
 const $=id=>document.getElementById(id);
 let config=null,draft=[],verified=null,addingCustomRow=null;
 const el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text||'';return x};
 const option=(value,label)=>{const x=el('option',label);x.value=value;return x};
 const select=(items,value)=>{const x=el('select');
  for(const [v,t] of items)x.append(option(v,t));
  x.value=value??'';return x};
 const codes=label=>{
  const raw=String(label||'').trim().toLowerCase();
  const alt={'motor':'motard','semi-ano.':'semi_ano','semi-anoniem':'semi_ano',
   'semi anoniem':'semi_ano','dispatch':'disp','radio bm':'radio_bm','siv/wpr':'wpr',
   'terreinondersteuner':'to','arrestatie-eenheid':'ae',
   'interventiedienst':'interventie'};
  return alt[raw]||raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
 };
 // Older uploaded BW/AGS artwork aliases are display-only, not roles.
 const codeAliases={
  red_team:['redteam','bw_red_team','bw_redteam'],
  gevaarlijke_stoffen:['gevaarlijkestoffen','ags','bw_ags','bw_gevaarlijke_stoffen'],
  signalisatie:['bw_sig','bw_signal','signa','bw_signalisatie','bw_signa'],
  grote_boot:['groteboot','bw_grote_boot','bw_boot'],
  bosbestrijding:['boswagen','bw_boswagen','bw_bosbestrijding'],
  heli:['mug_heli','mugheli'],
  basis_tr:['basis_training','basistraining','basisopleiding'],
  logistiek:['bw_log','bw_logistiek'],ladderwagen:['bw_ladderwagen'],
  duiker:['bw_duiker'],brandweer_ambu:['bw_ambu','ambu']
 };
 const codesFor=label=>{
  const code=codes(label);
  return [...new Set([code,...(codeAliases[code]||[])])];
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
  for(const code of codesFor(label)){
   for(const kind of ['specialty','patch']){
    for(const suffix of [code,code+'_lokaal',code+'_federaal']){
     const image=config?.assets?.find(x=>x.key===kind+'_'+dept+'_'+suffix);
     if(image)return image;
    }
   }
  }
  return null;
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
 function renderVerifiedRoleTiles(){
  const root=$('specialtyPersonList');
  root.querySelectorAll('.specialty-verified-role').forEach(tile=>tile.remove());
  if(!verified?.verified||!Array.isArray(verified.matches))return;
  for(const match of verified.matches){
   const tile=el('div');tile.className='specialty-person-item specialty-verified-role';
   const info=el('span');
   info.append(el('strong',match.label+' · '+(match.level||match.value)),
     el('small','Geverifieerde Discord-rol · '+match.roleId));
   tile.append(info);
   const asset=config?.assets?.find(x=>x.key===match.assetKey)||currentArtwork(match.label);
   if(asset){
    const img=el('img');img.src=asset.imageUrl;img.alt='Patch '+asset.label;
    img.loading='lazy';tile.append(img);
   }
   tile.title='Alleen weergave na actuele Discord-verificatie; geen handmatige rechtentoekenning';
   root.append(tile);
  }
 }

 function renderPersonList(items,options={}){
  const root=$('specialtyPersonList');root.replaceChildren();
  if(!Array.isArray(items))return;
  for(const spec of items){
   const row=el('details');row.className='specialty-person-item specialty-person-level';
   const head=el('summary'),info=el('span');
   info.append(el('strong',spec.label),el('small',
    'Functieniveau: '+String(spec.value||'Niet ingevuld')));
   head.append(info);
   const pic=currentArtwork(spec.label);
   if(pic){
    const image=el('img');image.src=pic.imageUrl;image.alt='Patch '+pic.label;
    image.loading='lazy';head.append(image);
   }
   row.append(head);
   if(options.editable&&spec.readOnly!==true&&typeof options.save==='function'){
    const form=el('form');form.className='specialty-person-editor';
    const level=el('label','Functieniveau voor '+spec.label);
    const choice=el('select');
    for(const opt of $('specialtyValue').options){
     const o=el('option',opt.textContent);o.value=opt.value;choice.append(o);
    }
    if(![...choice.options].some(o=>o.value===spec.value)){
     const extra=el('option',spec.value);extra.value=spec.value;choice.append(extra);
    }
    choice.value=spec.value;
    level.append(choice);
    const reasonLabel=el('label','Motivering (minstens 15 tekens)');
    const reason=el('textarea');reason.required=true;reason.minLength=15;
    reason.maxLength=500;reason.rows=2;
    reason.placeholder='Waarom wijzigt het functieniveau?';
    reasonLabel.append(reason);
    const button=el('button','Functieniveau bewaren');button.type='submit';
    const status=el('p');status.setAttribute('role','status');
    form.append(level,reasonLabel,button,status);
    form.addEventListener('submit',async event=>{
     event.preventDefault();
     if(!form.reportValidity())return;
     if(choice.value===spec.value){
      status.textContent='Het functieniveau is niet gewijzigd.';return;
     }
     if(!confirm('Functieniveau van '+spec.label+' wijzigen naar '+
      choice.value+'? Dit wordt in het personeelsdossier gelogd.'))return;
     button.disabled=true;status.textContent='Opslaan…';
     try{
      await options.save(spec.label,choice.value,reason.value.trim());
      status.textContent='Afzonderlijk opgeslagen.';
     }catch(error){
      status.textContent='Niet opgeslagen: '+error.message;
      button.disabled=false;
     }
    });
    row.append(form);
   }else{
    row.append(el('p',spec.readOnly?
     'Dit functieniveau volgt een geverifieerde Discord-rol en is niet handmatig wijzigbaar.':
     'Alleen bevoegd Officierenkader, Korpsleiding of geverifieerd technisch beheer kan dit functieniveau aanpassen.'));
   }
   root.append(row);
  }
  renderVerifiedRoleTiles();
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
  const dept=getDepartment();
  const legacyCombined=dept==='brandweer'?'Logistiek / Signalisatie':'';
  const labels=config.labels.filter(x=>x!==legacyCombined).map(x=>[x,x]);
  for(const row of draft){
   // Images uploaded for the whole department can be used without a role.
   // A legacy role-specific badge is valid only for the exact same role ID.
   const targetCode=codes(row.label),dept=getDepartment();
   const compatible=config.assets.filter(x=>!/^\d{15,22}_/.test(x.key)||
     row.roleId&&x.key.startsWith(row.roleId+'_'));
   const matches=image=>{
    const suffix=image.key.replace(new RegExp('^(?:rank|uniform|specialty|patch|helmet|profession|logo|pictogram)_'+dept+'_'),'');
    const acceptable=new Set([...codesFor(row.label).flatMap(code=>
     [code,code+'_lokaal',code+'_federaal']),
     ...(targetCode==='semi_ano'?['semi_anoniem','semi_anoniem_lokaal']:[]),
     ...(targetCode==='wpr'?['siv_wpr']:[])]);
    return acceptable.has(suffix);
   };
   const assets=[['','Geen afbeelding'],
    ...compatible.sort((x,y)=>Number(matches(y))-Number(matches(x)))
      .map(x=>[x.key,(matches(x)?'✓ ':'')+x.label+' · '+x.key])];
   const wrap=el('div');wrap.className='specialty-map-row';
   const field=(title,choices,key)=>{
    const group=el('label',title);
    const input=select(choices,key==='label'&&addingCustomRow===row?'__other__':row[key]);input.disabled=!config.canEdit;
    input.onchange=()=>{
     if(key==='label'&&input.value==='__other__'){
      addingCustomRow=row;render();return;
     }
     const previousRoleId=row.roleId;
     row[key]=input.value;
     if(key==='label')addingCustomRow=null;
     if(key==='label'||key==='roleId'&&previousRoleId&&
       row.assetKey?.startsWith(previousRoleId+'_'))row.assetKey='';
     render();
    };
    group.append(input);wrap.append(group);
   };
   const specialtyChoices=[
    ...(row.label===legacyCombined?
      [...labels,[legacyCombined,'Logistiek / Signalisatie (oud: kies aparte regels)']]:labels),
    ['__other__','Andere – nieuwe specialisatie toevoegen']
   ];
   field('Specialisatie',specialtyChoices,'label');
   if(addingCustomRow===row){
    const extra=el('label','Nieuwe specialisatienaam');
    const custom=el('input');custom.type='text';custom.maxLength=64;
    custom.placeholder='Naam, bv. AZLS bergredding';
    custom.autocomplete='off';custom.disabled=!config.canEdit;
    const register=el('button','Nieuwe specialisatie registreren');
    register.type='button';register.className='alt';register.disabled=!config.canEdit;
    register.onclick=async()=>{
     const reason=$('specialtyLinkReason').value.trim();
     if(reason.length<8)return notify('Vul onderaan een motivering van minstens 8 tekens in.',true);
     const label=custom.value.trim();
     if(!label)return notify('Vul eerst de nieuwe specialisatienaam in.',true);
     register.disabled=true;
     try{
      const result=await api('/api/specialty-links/'+encodeURIComponent(dept)+'/custom-label',
       'POST',{label,reason});
      config.labels=[...new Set([...config.labels,result.label])];
      row.label=result.label;row.assetKey='';addingCustomRow=null;
      render();
      notify('Nieuwe specialisatie '+result.label+' geregistreerd. Kies nu de patch, '+
       'bewaar de koppelingen en registreer kwalificaties per personeelsdossier.');
     }catch(e){notify(e.message,true)}
     finally{register.disabled=false}
    };
    extra.append(custom,register);wrap.append(extra);
   }
    if(row.label===legacyCombined){
     const warning=el('div','De gedeelde BW log/signa-rol heeft twee afzonderlijke patches nodig. '+
      'Koppel Logistiek en Signalisatie apart aan deze rol en kies voor elk een eigen afbeelding.');
     warning.className='specialty-map-warning';
     wrap.append(warning);
    }
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
   if(asset&&!/^\d{15,22}_/.test(asset.key)&&!matches(asset))
    preview.append(el('span','Andere afbeeldingscode: de expliciete koppeling werkt na opslaan. Controleer of deze patch bij '+row.label+' hoort.'));
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
  const dept=getDepartment();config=null;draft=[];verified=null;addingCustomRow=null;
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
   renderVerifiedRoleTiles();
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
  if(getDepartment()==='brandweer'&&draft.some(x=>
      x.roleId==='1309532437952466986'&&x.label==='Logistiek / Signalisatie'))
    return notify('BW log/signa heeft twee aparte regels nodig: Logistiek en Signalisatie. '+
     'Kies bij elk de eigen patch en bewaar opnieuw.',true);
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
