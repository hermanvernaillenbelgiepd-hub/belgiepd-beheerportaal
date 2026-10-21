export function setupDossierGrantUI({api,notice,$,option,cell}){
  let context=null;
  const names={politie:'Politie',brandweer:'Brandweer',ambulance:'Ambulance',depannage:'Depannage'};
  const section=$('dossierGrantSection');
  function error(e){notice('Dossierbeheer: '+e.message,true)}
  async function load(){
    if(!context){
      context=await api('/api/dossier-grants/context');
      if(!context.canManage){section.dataset.authorized='false';section.hidden=true;return false}
    }
    section.dataset.authorized='true';
    $('dossierTesterBox').hidden=!(context.testEnvironment&&context.canAssignTester);
    const select=$('dossierGrantDept'),old=select.value;select.replaceChildren();
    for(const d of context.canManageDepartments)select.append(option(d,names[d]||d));
    if([...select.options].some(x=>x.value===old))select.value=old;
    const result=await api('/api/dossier-grants');
    const root=$('dossierGrantRows');root.replaceChildren();
    if(!result.grants?.length){
      const tr=document.createElement('tr'),td=cell(tr,'Nog geen handmatige dienstmachtigingen.');td.colSpan=5;root.append(tr);
    }
    for(const grant of result.grants||[]){
      const tr=document.createElement('tr'),name=document.createElement('div');name.className='name';name.textContent=grant.username||'Discord-lid';
      const id=document.createElement('small');id.textContent=grant.discordId;id.style.display='block';name.append(id);cell(tr,name);
      cell(tr,grant.dept==='alle'?'Alle diensten (TESTER)':names[grant.dept]||grant.dept);
      cell(tr,grant.level==='all-read'?'TESTER – alleen lezen':grant.level==='manage'?'Beperkt beheer':'Alleen lezen');
      cell(tr,grant.status==='active'?'Actief':'Ingetrokken');
      const box=document.createElement('div');box.className='controls';
      if(grant.status==='active'&&grant.dept!=='alle'){
        const button=document.createElement('button');button.type='button';button.className='danger';button.textContent='Intrekken';
        button.onclick=async()=>{
          if(!confirm('Toegang van '+grant.discordId+' voor '+(names[grant.dept]||grant.dept)+' intrekken?'))return;
          const reason=prompt('Motivering (minimaal 10 tekens):','Dienstmachtiging niet meer nodig');
          if(reason===null)return;
          button.disabled=true;
          try{
            await api('/api/dossier-grants/'+encodeURIComponent(grant.dept)+'/'+encodeURIComponent(grant.discordId)+'/revoke',
              {method:'POST',body:{reason}});
            notice('Dossierrecht ingetrokken.');await load();
          }catch(e){error(e);button.disabled=false}
        };
        box.append(button);
      }else box.textContent='—';
      cell(tr,box);root.append(tr);
    }
    return true;
  }
  function reset(){context=null;section.dataset.authorized='false';section.hidden=true}
  $('dossierGrantForm').onsubmit=async e=>{
    e.preventDefault();const b=$('dossierGrantSave');b.disabled=true;
    try{
      await api('/api/dossier-grants',{method:'POST',body:{
        discordId:$('dossierGrantId').value.trim(),dept:$('dossierGrantDept').value,
        level:$('dossierGrantLevel').value,reason:$('dossierGrantReason').value.trim()}});
      $('dossierGrantForm').reset();notice('Dossierrecht geregistreerd.');await load();
    }catch(err){error(err)}finally{b.disabled=false}
  };
  $('dossierGrantReload').onclick=()=>load().catch(error);
  async function tester(enabled){
    const reason=prompt('Reden (minimaal 10 tekens):',
      enabled?'TEST: volledige dossierinzage controleren':'TESTER-toegang uitschakelen');
    if(reason===null)return;
    try{
      await api('/api/dossier-grants/tester',{method:'POST',body:{enabled,reason}});
      notice(enabled?'TESTER actief: alle dossiers lezen. Open het dossiercentrum.':'TESTER uitgeschakeld.');
      await load();
    }catch(e){error(e)}
  }
  $('dossierTesterOn').onclick=()=>tester(true);
  $('dossierTesterOff').onclick=()=>tester(false);
  return {load,reset};
}
