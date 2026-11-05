// Reuses the existing audited, per-service Firestore registries. This is
// client-side presentation only: every mutation is re-authorized on the API.
const STATES=['Nee','Stage','Ja','Docent','Niet ingevuld','AANGEMELD',
 'RESTRICTED','ONTSLAG','INSTRUCTEUR','PLAVA','GPC','INACTIEF',
 'MUG-HELI','SPECIALISATIE','LEIDING','OPLEIDING!','GESCHORST','BLACKLISTED'];
const DEPTS=new Set(['politie','brandweer','ambulance','depannage']);
const ID=/^\d{15,22}$/;
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const KIND='technical-center-service-editors';
const create=(tag,className='',text='')=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text)node.textContent=text;
 return node;
};
const option=(value,label)=>{const node=create('option');node.value=value;node.textContent=label;return node};
const textInput=(value,maxLength,onChange)=>{
 const el=create('input');el.type='text';el.maxLength=maxLength;el.value=value;
 el.oninput=()=>onChange(el.value);return el;
};
const pick=(options,value,onChange)=>{
 const el=create('select');
 for(const item of options)el.append(option(item.value,item.label));
 el.value=value;
 el.onchange=()=>onChange(el.value);
 return el;
};
const field=(name,control)=>{
 const wrapper=create('label');wrapper.textContent=name;wrapper.append(control);return wrapper;
};
const report=(element,message,isError=false)=>{
 element.textContent=message;element.className='notice'+(isError?' bad':'');
};
const serial=value=>JSON.stringify(value);

export function setupTechnicalServiceEditors({api,notice,$}){
 let mappings=null,rosters=null,workingCustom=[],busy=false,sequence=0;
 const selectedDept=()=>DEPTS.has($('serviceDept').value)?$('serviceDept').value:'politie';
 const currentLayout=()=>rosters?.departments?.[selectedDept()]||null;
 const canSaveLinks=()=>mappings?.canEdit===true;
 const canSaveLayout=()=>rosters?.canEdit===true;
 const status=(message,error=false)=>report($('serviceMessage'),message,error);
 const setBusy=value=>{
   busy=value;
   $('serviceDept').disabled=value;
   $('resetLinks').disabled=value||!canSaveLinks();
   $('saveLinks').disabled=value||!canSaveLinks();
   $('saveRoster').disabled=value||!canSaveLayout();
   $('addLink').disabled=value||!canSaveLinks();
   $('addCustom').disabled=value||!canSaveLayout();
 };
 const assetOptions=link=>{
   const arr=[{value:'',label:'Geen badge / automatische rolpatch'}];
   for(const a of mappings.assets||[]){
     const key=String(a.key||'');
     // A role-specific image cannot be used with a different Discord role.
     if(ID.test(key.split('_')[0])&&!(link.roleId&&key.startsWith(link.roleId+'_')))continue;
     arr.push({value:key,label:(a.label||key)+' · '+key});
   }
   if(link.assetKey&&!arr.some(x=>x.value===link.assetKey))
     arr.push({value:link.assetKey,label:'Ontbrekende patch · '+link.assetKey});
   return arr;
 };
 function renderMappings(){
   const root=$('linkRows');root.replaceChildren();
   $('specialtyEditor').hidden=!mappings;
   if(!mappings)return;
   $('specialtyRevision').textContent='Versie '+mappings.revision+
      ' · '+mappings.roles.length+' bekende rol-ID’s';
   const allowed=mappings.canEdit===true;
   const links=mappings.links||[];
   $('linkCount').textContent=links.length+' van maximaal 120 koppelingen';
   for(let index=0;index<links.length;index++){
     const record=links[index];
     const row=create('div','edit-line');
     const label=pick((mappings.labels||[]).map(x=>({value:x,label:x})),
      record.label,value=>{record.label=value},);
     const roles=[{value:'',label:'Geen Discordrol · handmatig'},...mappings.roles.map(x=>({
       value:x.id,label:x.name+' · '+x.id
     }))];
     const role=pick(roles,record.roleId,value=>{
       record.roleId=value;
       if(record.assetKey&&ID.test(record.assetKey.split('_')[0])&&
        !record.assetKey.startsWith(value+'_'))record.assetKey='';
       renderMappings();
     });
     const level=textInput(record.level,45,value=>{record.level=value});
     const state=pick(STATES.map(x=>({value:x,label:x})),record.value,
       value=>{record.value=value});
     const artwork=pick(assetOptions(record),record.assetKey||'',
       value=>{record.assetKey=value});
     for(const [title,control] of [
       ['Specialisatie',label],['Discord-rol-ID',role],['Niveau/variant',level],
       ['Status',state],['Afbeelding',artwork]
     ]){
       control.disabled=!allowed;
       row.append(field(title,control));
     }
     const remove=create('button','secondary remove','Wissen');
     remove.type='button';remove.disabled=!allowed;
     remove.title='Deze koppeling verwijderen uit de huidige bewerking';
     remove.onclick=()=>{
       if(!confirm('Deze rolkoppeling uit de lijst verwijderen? Bewaren is daarna nog nodig.'))return;
       mappings.links.splice(index,1);renderMappings();
     };
     row.append(remove);
     root.append(row);
   }
   if(!links.length)root.append(create('p','muted','Nog geen koppelingen. Voeg een regel toe.'));
   $('linkReason').disabled=!allowed;
   $('resetLinks').disabled=!allowed;
   setBusy(busy);
 }
 function renderCustom(){
   const root=$('customSpecialties');root.replaceChildren();
   for(let index=0;index<workingCustom.length;index++){
     const x=workingCustom[index];
     const row=create('div','custom-item');
     const text=create('span','',x.icon+' '+x.label+' · '+x.code+
       (x.public?' · openbaar':' · intern'));
     row.append(text);
     if(canSaveLayout()){
       const remove=create('button','secondary','Verwijderen');remove.type='button';
       remove.onclick=()=>{
         if(!confirm('Specialisatie '+x.label+' verwijderen uit de configuratie? Historische registraties blijven behouden.'))return;
         workingCustom.splice(index,1);renderCustom();
       };
       row.append(remove);
     }
     root.append(row);
   }
   if(!workingCustom.length)root.textContent='Geen extra specialisaties voor deze dienst.';
 }
 function renderLayout(){
   const config=currentLayout();
   $('layoutEditor').hidden=!config;
   if(!config)return;
   $('rosterFont').value=config.fontFamily||'inter';
   $('rosterSize').value=String(config.fontSize||11);
   $('layoutRevision').textContent='Versie '+config.revision+
     ' · bestaande kolominstellingen blijven behouden';
   workingCustom=(config.customSpecialties||[]).map(x=>({...x}));
   for(const id of ['rosterFont','rosterSize','layoutReason','customLabel',
     'customCode','customIcon','customPublic']){
     $(id).disabled=!canSaveLayout();
   }
   renderCustom();setBusy(busy);
 }
 async function loadDepartment(){
   const dept=selectedDept(),seq=++sequence;
   mappings=null;
   $('specialtyEditor').hidden=true;$('layoutEditor').hidden=true;
   status('Koppelingen en dienstinstellingen voor '+dept+' laden…');
   try{
     const [mappingResponse,layoutResponse]=await Promise.allSettled([
       api('/api/specialty-links/'+encodeURIComponent(dept)),
       rosters?Promise.resolve(rosters):api('/api/roster-columns')
     ]);
     if(seq!==sequence)return;
     if(layoutResponse.status==='fulfilled')rosters=layoutResponse.value;
     if(mappingResponse.status==='fulfilled'){
       mappings=mappingResponse.value;
       mappings.links=(mappings.links||[]).map(x=>({...x}));
       renderMappings();
     }
     renderLayout();
     if(mappingResponse.status==='rejected'&&layoutResponse.status==='rejected')
       return status('Dienstinstellingen niet beschikbaar: '+
         mappingResponse.reason.message+' · '+layoutResponse.reason.message,true);
     const count=mappings?.links?.length||0;
     status('Dienst geladen: '+count+' rolkoppelingen. '+
       (canSaveLinks()?'Koppelingen mogen aangepast worden.':
         'Koppelingen alleen ter inzage. ')+
       (canSaveLayout()?'Dienstweergave mag worden aangepast.':
         'Dienstweergave alleen ter inzage.'));
   }catch(e){status('Dienstgegevens niet beschikbaar: '+e.message,true)}
 }
 async function load(){
   if(!DEPTS.has($('serviceDept').value))$('serviceDept').value='politie';
   rosters=null;await loadDepartment();
 }
 $('serviceDept').onchange=()=>void loadDepartment();
 $('resetLinks').onclick=()=>void loadDepartment();
 $('addLink').onclick=()=>{
   if(!canSaveLinks()||busy)return;
   if(mappings.links.length>=120)return status('Maximaal 120 koppelingen per dienst.',true);
   if(!mappings.labels?.length)return status('Maak eerst een dienstspecialisatie aan.',true);
   mappings.links.push({label:mappings.labels[0],roleId:'',level:'',value:'Ja',assetKey:''});
   renderMappings();
 };
 $('saveLinks').onclick=async()=>{
   if(!canSaveLinks()||busy)return;
   const dept=selectedDept();
   const reason=$('linkReason').value.trim();
   if(reason.length<8||reason.length>300)
     return status('Motivering van minimaal 8 en maximaal 300 tekens verplicht.',true);
   if(mappings.links.some(x=>x.roleId&&!ID.test(x.roleId)))
     return status('Er is een ongeldige Discord-rol-ID geselecteerd.',true);
   if(!confirm('De '+mappings.links.length+' specialisatiekoppelingen van '+
     dept+' bewaren? De wijziging wordt centraal gelogd.'))return;
   setBusy(true);
   try{
     const response=await api('/api/specialty-links/'+dept,'PUT',{
       expectedRevision:mappings.revision,links:mappings.links,reason
     });
     if(response.saved){
       $('linkReason').value='';
       status('Specialisatiekoppelingen opgeslagen en gelogd. Discord-rollen en kaderrechten zijn niet gewijzigd.');
       await loadDepartment();
     }
   }catch(e){status('Koppelingen niet opgeslagen: '+e.message,true)}
   finally{setBusy(false)}
 };
 $('addCustom').onclick=()=>{
   if(!canSaveLayout()||busy)return;
   const label=$('customLabel').value.trim();
   const code=$('customCode').value.trim();
   const icon=$('customIcon').value.trim();
   const isPublic=$('customPublic').checked;
   if(label.length<2||label.length>64||/[<>\x00-\x1f\x7f]/.test(label)||
     !CODE.test(code)||icon.length>10||/[<>\x00-\x1f\x7f]/.test(icon))
     return status('Naam (2–64), unieke code in kleine letters en pictogram zijn verplicht geldig.',true);
   if(workingCustom.length>=20)
     return status('Maximaal 20 bijkomende specialisaties per dienst.',true);
   if(workingCustom.some(x=>x.code===code||
     x.label.toLocaleLowerCase('nl-BE')===label.toLocaleLowerCase('nl-BE')))
     return status('Deze specialisatie of code is al toegevoegd.',true);
   workingCustom.push({label,code,icon,public:isPublic});
   for(const id of ['customLabel','customCode','customIcon'])$(id).value='';
   $('customPublic').checked=false;
   renderCustom();
   status('Specialisatie toegevoegd aan deze bewerking. Klik op Dienstinstellingen bewaren om ze op te slaan.');
 };
 $('saveRoster').onclick=async()=>{
   if(!canSaveLayout()||busy)return;
   const dept=selectedDept(),config=currentLayout();
   if(!config)return;
   const fontSize=Number($('rosterSize').value);
   const fontFamily=$('rosterFont').value;
   const reason=$('layoutReason').value.trim();
   if(!Number.isSafeInteger(fontSize)||fontSize<9||fontSize>18)
     return status('Lettergrootte moet 9–18 px zijn.',true);
   if(reason.length<8||reason.length>300)
     return status('Geef een motivering van 8–300 tekens.',true);
   const activeLabels=new Set(workingCustom.map(x=>x.label));
   const excluded=new Set((config.customSpecialties||[])
     .filter(x=>!activeLabels.has(x.label)).map(x=>x.label));
   const widths=Object.fromEntries(Object.entries(config.specialtyWidths||{})
     .filter(([label])=>!excluded.has(label)));
   const request={expectedRevision:config.revision,
     widths:config.widths,specialtyWidths:widths,
     fontSize,fontFamily,customSpecialties:workingCustom,reason};
   if(serial({
     fontSize:config.fontSize,fontFamily:config.fontFamily,
     customSpecialties:config.customSpecialties
   })===serial({fontSize,fontFamily,customSpecialties:workingCustom}))
     return status('Geen wijzigingen om te bewaren.');
   if(!confirm('Dienstinstellingen voor '+dept+
     ' bewaren? De personeelslijst en nieuwe specialisaties worden bijgewerkt.'))return;
   setBusy(true);
   try{
     const updated=await api('/api/roster-columns/'+dept,'PUT',request);
     rosters.departments[dept]=updated.config;
     $('layoutReason').value='';
     renderLayout();
     status('Dienstinstellingen opgeslagen en gelogd. De personeelslijst gebruikt de nieuwe weergave.');
     // The server now recognizes newly added custom specialty labels for role links.
     await loadDepartment();
   }catch(e){status('Dienstinstellingen niet opgeslagen: '+e.message,true)}
   finally{setBusy(false)}
 };
 return {load};
}
