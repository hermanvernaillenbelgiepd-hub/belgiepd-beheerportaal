// Beheercentrum -> Vormgeving. Preview is local until a guarded PUT succeeds.
// The server revalidates all fields, permissions and the revision.
export function setupVisualDesignEditor({api,$}){
 const fieldNames=['themeDefault','accent','fontFamily','fontScale','density'];
 const defaults={themeDefault:'light',accent:'blue',fontFamily:'inter',fontScale:100,density:'normal'};
 let loaded=null,active=false;
 const form=$('visualDesignForm');
 const status=(message,bad=false)=>{
  $('visualDesignStatus').textContent=message;
  $('visualDesignStatus').classList.toggle('bad',bad);
 };
 const values=()=>Object.fromEntries(fieldNames.map(key=>[
  key,key==='fontScale'?Number($('visual-'+key).value):$('visual-'+key).value
 ]));
 function fill(v){
  for(const key of fieldNames)
   $('visual-'+key).value=String(v?.[key]??defaults[key]);
  $('visualScaleOut').textContent=$('visual-fontScale').value+'%';
 }
 function paintPreview(){
  $('visualScaleOut').textContent=$('visual-fontScale').value+'%';
  window.BPDVisualDesign?.apply(values(),{preview:true});
  $('visualDesignPreview').dataset.accent=$('visual-accent').value;
  $('visualDesignPreview').style.fontFamily=
   ({inter:'Inter,system-ui,sans-serif',system:'system-ui,sans-serif',
     arial:'Arial,sans-serif',serif:'Georgia,serif'})[$('visual-fontFamily').value];
  $('visualDesignPreview').style.fontSize=
    (Number($('visual-fontScale').value)*.14)+'px';
  $('visualDesignPreview').style.padding=$('visual-density').value==='comfortable'?
    '20px':$('visual-density').value==='compact'?'10px':'15px';
 }
 function history(rows){
  const root=$('visualDesignHistory');root.replaceChildren();
  if(!rows?.length){root.textContent='Nog geen wijzigingen vastgelegd.';return}
  for(const e of rows){
   const li=document.createElement('li');
   const at=e.at?new Date(e.at).toLocaleString('nl-BE'):'Datum onbekend';
   li.textContent=at+' · '+e.reason;
   root.append(li);
  }
 }
 async function load(){
  const response=await api('/api/visual-design/admin');
  loaded=response;active=response.canEdit===true;
  $('visualDesign').hidden=!active;
  $('visualDesignTile').hidden=!active;
  if(!active)return;
  fill(response.settings);
  $('visualReason').value='';
  $('visualRevision').textContent='Versie '+response.revision;
  history(response.history);
  status('Centrale instellingen geladen. Een voorbeeld wordt pas gepubliceerd na Opslaan.');
 }
 function reset(){
  if(!active)return;
  fill(loaded?.settings||defaults);
  window.BPDVisualDesign?.restore();
  status('Voorbeeld teruggezet naar de laatst opgeslagen instellingen.');
 }
 function showErrors(error){
  status('Niet bewaard: '+error.message,true);
 }
 for(const key of fieldNames){
  const element=$('visual-'+key);
  element.addEventListener(key==='fontScale'?'input':'change',()=>{
    if(active)paintPreview();
  });
 }
 $('visualReset').onclick=reset;
 $('visualDefaults').onclick=()=>{
  if(!active)return;
  fill(defaults);paintPreview();
  status('Standaardwaarden als voorbeeld geladen. Voeg een motivering toe en kies Opslaan om ze te publiceren.');
 };
 $('visualReload').onclick=async()=>{
  if(!active)return;
  try{await load();window.BPDVisualDesign?.restore()}
  catch(e){showErrors(e)}
 };
 form.onsubmit=async event=>{
  event.preventDefault();
  if(!active||!loaded||!form.reportValidity())return;
  const reason=$('visualReason').value.trim();
  if(reason.length<10||reason.length>240)
   return status('Vul een motivering van 10 tot 240 tekens in.',true);
  if(!window.confirm('Deze vormgeving als standaard publiceren voor alle portaalgebruikers? Persoonlijke licht/donkerkeuzes blijven behouden.'))return;
  $('visualSave').disabled=true;
  try{
   const previous=loaded.revision;
   const result=await api('/api/visual-design/admin','PUT',{
    ...values(),expectedRevision:previous,reason
   });
   if(result.saved!==true)throw Error('De server heeft de opslag niet bevestigd');
   await load();
   await window.BPDVisualDesign?.reload();
   status(result.changed?'Vormgeving gepubliceerd met auditlog.':'Geen wijziging: de instellingen zijn al gelijk.');
  }catch(e){showErrors(e)}
  finally{$('visualSave').disabled=false}
 };
 return {load,reset};
}
