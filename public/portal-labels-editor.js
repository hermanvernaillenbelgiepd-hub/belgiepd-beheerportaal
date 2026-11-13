// Central label editor; all access and writes rechecked by server.
(async function(){
  const root=document.getElementById('portalLabelEditor');
  if(!root)return;
  const list=root.querySelector('#portalLabelRows');
  const status=root.querySelector('#portalLabelStatus');
  const reason=root.querySelector('#portalLabelReason');
  let auth, revision=0, entries=[];
  function message(s){status.textContent=s;}
  function addRow(original='',label=''){
    const row=document.createElement('div');
    row.className='form-grid';row.style.marginBottom='10px';
    const first=document.createElement('label');first.textContent='Huidige benaming';
    const key=document.createElement('input');key.maxLength=90;key.value=original;key.placeholder='Exacte zichtbare tekst';
    const second=document.createElement('label');second.textContent='Nieuwe benaming';
    const value=document.createElement('input');value.maxLength=90;value.value=label;value.placeholder='Nieuwe tekst';
    const remove=document.createElement('button');remove.type='button';remove.className='secondary';
    remove.textContent='Verwijderen';remove.addEventListener('click',()=>row.remove());
    first.append(key);second.append(value);row.append(first,second,remove);list.append(row);
    row.getData=()=>[key.value.trim(),value.value.trim()];
  }
  async function request(path,method='GET',body){
    const token=await auth.currentUser.getIdToken();
    const response=await fetch(path,{method,cache:'no-store',
      headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'Serverfout '+response.status);
    return data;
  }
  async function load(){
    if(!auth.currentUser){root.hidden=true;return;}
    try{
      const data=await request('/api/portal-labels/manage');
      revision=data.revision;entries=Object.entries(data.labels||{});
      list.replaceChildren();entries.forEach(([a,b])=>addRow(a,b));
      root.hidden=false;message('Benamingen geladen · versie '+revision);
    }catch(error){root.hidden=true;}
  }
  root.querySelector('#portalLabelAdd').addEventListener('click',()=>addRow());
  root.querySelector('#portalLabelReload').addEventListener('click',load);
  root.querySelector('#portalLabelSave').addEventListener('click',async()=>{
    const labels=[...list.children].map(row=>row.getData());
    if(labels.some(([a,b])=>a.length<2||b.length<2)||
      new Set(labels.map(([a])=>a)).size!==labels.length){
      message('Controleer lege velden en dubbele oorspronkelijke benamingen.');return;
    }
    if(reason.value.trim().length<8){message('Geef een motivering van minstens 8 tekens.');return;}
    const save=root.querySelector('#portalLabelSave');save.disabled=true;
    try{
      await request('/api/portal-labels/manage','PUT',{
        revision,labels,reason:reason.value.trim()});
      reason.value='';await load();message('Benamingen opgeslagen. Vernieuw andere pagina’s om wijzigingen te zien.');
    }catch(error){message('Niet opgeslagen: '+error.message);}
    finally{save.disabled=false;}
  });
  try{
    const cfg=await fetch('/api/client-config',{cache:'no-store'}).then(r=>r.json());
    if(!cfg.enabled)return;
    const apps=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
    const authSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    const app=apps.getApps()[0]||apps.initializeApp(cfg.firebaseConfig);
    auth=authSdk.getAuth(app);
    authSdk.onAuthStateChanged(auth,()=>void load());
  }catch(_error){root.hidden=true;}
})();