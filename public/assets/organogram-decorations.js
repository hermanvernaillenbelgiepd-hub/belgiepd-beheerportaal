/* Interactive interface. The server alone determines who may grant/revoke. */
(function(){
 'use strict';
 function node(tag,cls,text){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);
  return n;
 }
 function ribbon(item){
  const elem=node('span','bpd-ribbon');
  elem.dataset.color=['red','silver','gold','blue-silver','blue-gold','red-gold','blue-white','red-black','gold-blue'].includes(item?.color)?
   item.color:'blue-gold';
  elem.setAttribute('aria-hidden','true');
  if(typeof item?.imageUrl==='string'&&
     /^\/api\/personnel-awards\/catalog-image\/custom_[a-f0-9-]{36}$/i.test(item.imageUrl)){
   const img=node('img','bpd-award-art');
   img.src=item.imageUrl;img.alt='';img.loading='lazy';img.decoding='async';
   elem.append(img);
  }
  return elem;
 }
 function renderAwards(root,awards,demo=false){
  const block=node('section','bpd-awards');
  block.append(node('h3','','Onderscheidingen'));
  const group=node('div','bpd-awards-list');
  if(Array.isArray(awards)&&awards.length){
   awards.slice(0,30).forEach(x=>{
    if(typeof x==='string'){
     const a=node('span','bpd-award',x);group.append(a);return;
    }
    const row=node('span','bpd-award');row.dataset.kind=x.kind==='medal'?'medal':x.kind==='badge'?'badge':'ribbon';
    row.append(ribbon(x),node('span','bpd-award-label',String(x.label||'Onderscheiding').slice(0,90)));
    row.title=String(x.label||'').slice(0,90);group.append(row);
   });
  }else group.append(node('span','bpd-no-awards','Geen actieve, publiek zichtbare onderscheidingen'));
  block.append(group);
  if(!demo)block.append(node('p','bpd-no-awards','Tijdelijke onderscheidingen verdwijnen automatisch na hun einddatum; de historiek blijft bestaan.'));
  root.append(block);
 }
 function hangingMedal(item){
  const medal=node('span','bpd-hanging-medal');
  const id=String(item.id||'');
  medal.dataset.medal=['kroon_blauw','ereteken_zilver','ereteken_rood',
    'dienstmedaille_zilver','dienstmedaille_goud'].includes(id)?id:'other';
  medal.title=String(item.label||'Onderscheiding').slice(0,90);
  const fabric=node('span','bpd-medal-hanger');
  fabric.dataset.color=String(item.color||'');
  const emblem=node('span','bpd-medal-pendant',
    id==='kroon_blauw'?'♛':id.startsWith('ereteken')?'✦':'✧');
  if(typeof item?.imageUrl==='string'&&
    /^\/api\/personnel-awards\/catalog-image\/custom_[a-f0-9-]{36}$/i.test(item.imageUrl)){
    const img=node('img','bpd-medal-art');
    img.src=item.imageUrl;img.alt='';img.loading='lazy';img.decoding='async';
    medal.append(img);
  }else medal.append(fabric,emblem);
  return medal;
 }
 function uniformRack(awards){
  const valid=(Array.isArray(awards)?awards:[])
   .filter(x=>x&&typeof x==='object'&&typeof x.color==='string'&&
     ['ribbon','medal','badge'].includes(x.kind))
   .sort((a,b)=>(Number(a.priority)||999)-(Number(b.priority)||999));
  if(!valid.length)return null;
  // Medals are hanging decorations below the rank plate, not an
  // additional ribbon above it. Never show the same medal twice.
  const upper=valid.filter(x=>x.kind==='ribbon'||x.kind==='badge').slice(0,4);
  let ribbons=null;
  if(upper.length){
    ribbons=node('span','bpd-uniform-ribbons');
    ribbons.setAttribute('aria-hidden','true');
    upper.forEach(x=>ribbons.append(ribbon(x)));
  }
  const hanging=valid.filter(x=>x.kind==='medal').slice(0,3);
  let medals=null;
  if(hanging.length){
    medals=node('span','bpd-uniform-medals');
    medals.setAttribute('aria-hidden','true');
    hanging.forEach(x=>medals.append(hangingMedal(x)));
  }
  return {ribbons,medals};
 }
 async function manager(root,person,auth,refresh){
  if(!auth?.currentUser||!person||person.dept!=='politie')return;
  const ownerUid=auth.currentUser.uid,identity=person.call+'|'+person.name;
  try{
   const token=await auth.currentUser.getIdToken();
   if(auth.currentUser?.uid!==ownerUid)return;
   const params=new URLSearchParams({call:person.call,name:person.name});
   const response=await fetch('/api/personnel-awards/manage?'+params,{
    headers:{Authorization:'Bearer '+token},cache:'no-store'
   });
   if(response.status===403||response.status===401||response.status===404){
    // Information only; the authorization check remains exclusively on the server.
    if(root.isConnected&&root.dataset.personKey===identity)
     root.append(node('p','bpd-awards-guidance',
      'Alleen geverifieerd Officierenkader en Korpsleiding kunnen politieonderscheidingen beheren. Dit geeft geen toegang tot afgeschermde dossiers.'));
    return;
   }
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.canManage||!Array.isArray(data.catalog)){
    if(root.isConnected&&root.dataset.personKey===identity)
     root.append(node('p','bpd-awards-guidance',
      'Toekennen tijdelijk niet beschikbaar. Controleer je Discord-aanmelding.'));
    return;
   }
   if(auth.currentUser?.uid!==ownerUid||!root.isConnected||root.dataset.personKey!==identity)return;
   const panel=node('details','bpd-awards-control');
   panel.append(node('summary','','Onderscheiding toekennen / intrekken · Officierenkader en Korpsleiding'));
   const catalogue=node('select');
   data.catalog.forEach(item=>{
    const o=node('option','',item.label);o.value=item.id;catalogue.append(o);
   });
   panel.append(node('label','','Onderscheiding'),catalogue);
   const catalogueRefresh=e=>{
    if(!root.isConnected||root.dataset.personKey!==identity){
     document.removeEventListener('bpd-decoration-uploaded',catalogueRefresh);return;
    }
    const item=e?.detail;if(!item?.id||!item?.label)return;
    if([...catalogue.options].some(x=>x.value===item.id))return;
    const option=node('option','',item.label);option.value=item.id;
    catalogue.append(option);catalogue.value=item.id;
   };
   document.addEventListener('bpd-decoration-uploaded',catalogueRefresh);
    document.addEventListener('bpd-decoration-renamed',e=>{
     if(!root.isConnected||root.dataset.personKey!==identity)return;
     const option=[...catalogue.options].find(x=>x.value===e?.detail?.id);
     if(option)option.textContent=e.detail.label;
    });
   const dates=node('div','bpd-inline'),startBox=node('div'),endBox=node('div');
   const start=node('input');start.type='date';start.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const end=node('input');end.type='date';end.min=start.value;
   start.addEventListener('change',()=>end.min=start.value);
   startBox.append(node('label','','Startdatum'),start);
   endBox.append(node('label','','Einddatum (leeg = permanent)'),end);
   dates.append(startBox,endBox);panel.append(dates);
   const publBox=node('label','bpd-checkbox');
   const pub=node('input');pub.type='checkbox';pub.checked=true;
   publBox.append(pub,node('span','','Publiek zichtbaar op personeelsfiche en uniform'));
   panel.append(publBox);
   const reason=node('textarea');reason.rows=3;reason.maxLength=500;
   reason.placeholder='Motivering (minimaal 10 tekens)';
   panel.append(node('label','','Motivering'),reason);
   const feedback=node('p','');
   const grant=node('button','','Toekennen');grant.type='button';
   const request=async(url,body,button)=>{
    if(auth.currentUser?.uid!==ownerUid)return;
    button.disabled=true;feedback.textContent='Opslaan…';feedback.className='';
    try{
     const key=await auth.currentUser.getIdToken();
     const res=await fetch(url,{method:'POST',
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({call:person.call,name:person.name,...body})});
     const result=await res.json().catch(()=>({}));
     if(!res.ok)throw Error(result.error||'Opslaan mislukt');
     feedback.className='bpd-awards-success';
     feedback.textContent='Opgeslagen en gelogd. Personeelslijst wordt vernieuwd.';
     await refresh();
    }catch(error){feedback.className='bpd-awards-error';feedback.textContent=error.message;}
    finally{button.disabled=false;}
   };
   grant.addEventListener('click',()=>request('/api/personnel-awards/grant',{
    catalogId:catalogue.value,startDate:start.value,endDate:end.value||null,
    public:pub.checked,reason:reason.value
   },grant));
   panel.append(grant,feedback);
   const history=node('ul','bpd-awards-history');
   (Array.isArray(data.entries)?data.entries:[]).forEach(entry=>{
    const li=node('li');
    li.append(node('strong','',entry.label),
     node('small','',entry.state+' · '+entry.startDate+
      (entry.endDate?' t/m '+entry.endDate:' · permanent')+
      (entry.public?' · publiek':' · intern')));
    if(entry.state!=='ingetrokken'){
     const button=node('button','','Intrekken');button.type='button';
     button.addEventListener('click',()=>{
      const motivation=window.prompt('Motivering voor intrekken (min. 10 tekens):');
      if(motivation===null)return;
      request('/api/personnel-awards/revoke',{id:entry.id,reason:motivation},button);
     });
     li.append(button);
    }
    history.append(li);
   });
   if(data.entries?.length)panel.append(node('h3','','Historiek (blijft bewaard)'),history);
   root.append(panel);
  }catch(_){/* Gated UI fails closed; ordinary member view remains unchanged. */}
 }
 async function uploadTools(auth,target,onChange=null){
  if(!target)return;
  target.replaceChildren();
  const user=auth?.currentUser;
  if(!user||!String(user.uid||'').startsWith('discord:'))return;
  const uid=user.uid;
  try{
   const token=await user.getIdToken();
   const response=await fetch('/api/personnel-awards/catalog-access',{
    headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const access=await response.json().catch(()=>({}));
   if(!response.ok||(!access.canUpload&&!access.canRename)||auth.currentUser?.uid!==uid)return;
   const details=node('details','bpd-awards-control bpd-catalog-upload');
   details.append(node('summary','','Eigen ereteken uploaden · Officierenkader / Korpsleiding'));
   details.append(node('p','bpd-no-awards',
    'PNG, JPG of WebP. Eerst toevoegen aan de catalogus; daarna kun je het toekennen aan een toegestaan personeelsdossier.'));
   const label=node('input');label.type='text';label.maxLength=80;label.placeholder='Naam van de onderscheiding';
   const kind=node('select');
   for(const [value,title] of [['ribbon','Erelint / lintje'],['medal','Hangende medaille'],['badge','Ereteken / insigne']]){
    const opt=node('option','',title);opt.value=value;kind.append(opt);
   }
   const color=node('select');
   for(const [value,title] of [['blue-gold','Blauw/goud'],['red-gold','Rood/goud'],
     ['silver','Zilver'],['gold','Goud'],['red','Rood'],['blue','Blauw']]){
    const opt=node('option','',title);opt.value=value;color.append(opt);
   }
   const file=node('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';
   const notice=node('p','bpd-awards-guidance');
   const save=node('button','','Afbeelding uploaden');save.type='button';
   details.append(node('label','','Naam'),label,node('label','','Soort'),kind,
    node('label','','Lintkleur'),color,node('label','','Afbeeldingsbestand'),file,save,notice);
   const encodeImage=selected=>new Promise((resolve,reject)=>{
    if(!selected||selected.size>8*1024*1024)return reject(Error('Kies een afbeelding kleiner dan 8 MB'));
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('Afbeelding kon niet gelezen worden'));
    reader.onload=()=>{
     const photo=new Image();
     photo.onerror=()=>reject(Error('Geen geldig afbeeldingsbestand'));
     photo.onload=()=>{
      const canvas=document.createElement('canvas');
      const side=220;canvas.width=side;canvas.height=side;
      const ctx=canvas.getContext('2d');
      const scale=Math.min(side/photo.width,side/photo.height);
      const w=photo.width*scale,h=photo.height*scale;
      ctx.clearRect(0,0,side,side);
      ctx.drawImage(photo,(side-w)/2,(side-h)/2,w,h);
      const encoded=canvas.toDataURL('image/webp',.8);
      if(encoded.length>108000)reject(Error('Afbeelding te groot na verkleinen'));
      else resolve(encoded);
     };
     photo.src=reader.result;
    };
    reader.readAsDataURL(selected);
   });
   save.addEventListener('click',async()=>{
    if(auth.currentUser?.uid!==uid)return;
    save.disabled=true;notice.textContent='Afbeelding verwerken en opslaan…';notice.className='bpd-awards-guidance';
    try{
     const imageDataUri=await encodeImage(file.files?.[0]);
     const bearer=await auth.currentUser.getIdToken();
     const response=await fetch('/api/personnel-awards/catalog-upload',{
      method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
      body:JSON.stringify({label:label.value.trim(),kind:kind.value,color:color.value,imageDataUri})
     });
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(data.error||'Upload mislukt');
     document.dispatchEvent(new CustomEvent('bpd-decoration-uploaded',{detail:data.item}));
     notice.className='bpd-awards-success';
     notice.textContent='Toegevoegd aan catalogus. Kies een lager personeelsdossier en open Toekennen.';
     label.value='';file.value='';
    }catch(err){notice.className='bpd-awards-error';notice.textContent=err.message;}
    finally{save.disabled=false}
   });
   if(auth.currentUser?.uid!==uid)return;
   if(access.canUpload)target.append(details);
   // The name is catalogue metadata, not a new award grant. All existing
   // recipient links keep their stable catalogue ID after an audited rename.
   const rename=node('details','bpd-awards-control bpd-catalog-rename');
   rename.append(node('summary','','Naam medaille / ereteken aanpassen'));
   rename.append(node('p','bpd-no-awards',
    'Wijzig de benaming van een bestaand erelint, een medaille of een ereteken. Toekenningen blijven behouden.'));
   const catalogPick=node('select'),newName=node('input'),renameReason=node('textarea');
   newName.type='text';newName.maxLength=80;newName.placeholder='Nieuwe benaming (3–80 tekens)';
   renameReason.rows=2;renameReason.maxLength=500;renameReason.placeholder='Waarom wordt de naam gewijzigd?';
   const renameButton=node('button','','Naam opslaan');renameButton.type='button';
   const renameStatus=node('p','bpd-awards-guidance');
   rename.append(node('label','','Bestaande onderscheiding'),catalogPick,
    node('label','','Nieuwe naam'),newName,
    node('label','','Motivering voor auditlog'),renameReason,renameButton,renameStatus);
   target.append(rename);
   try{
    const bearer=await auth.currentUser.getIdToken();
    const listResponse=await fetch('/api/personnel-awards/catalog-labels',{
     headers:{Authorization:'Bearer '+bearer},cache:'no-store'});
    const data=await listResponse.json().catch(()=>({}));
    if(!listResponse.ok||!Array.isArray(data.catalog))throw Error(data.error||'Catalogus niet beschikbaar');
    const labels=new Map(data.catalog.map(x=>[x.id,x]));
    const populate=()=>{
     catalogPick.replaceChildren();
     [...labels.values()].sort((a,b)=>a.label.localeCompare(b.label,'nl-BE')).forEach(x=>{
      const option=node('option','',x.label);option.value=x.id;catalogPick.append(option);
     });
     newName.value=labels.get(catalogPick.value)?.label||'';
    };
    catalogPick.addEventListener('change',()=>{newName.value=labels.get(catalogPick.value)?.label||''});
    populate();
    document.addEventListener('bpd-decoration-uploaded',e=>{
     if(!target.isConnected)return;
     const item=e?.detail;
     if(!item?.id||!item.label)return;
     labels.set(item.id,item);
     populate();catalogPick.value=item.id;newName.value=item.label;
    });
    renameButton.addEventListener('click',async()=>{
     if(auth.currentUser?.uid!==uid)return;
     const id=catalogPick.value, label=newName.value.trim(),reason=renameReason.value.trim();
     if(!labels.has(id)||label.length<3||label.length>80||reason.length<10){
      renameStatus.className='bpd-awards-error';
      renameStatus.textContent='Vul een geldige naam en een motivering van minstens 10 tekens in.';return;
     }
     renameButton.disabled=true;
     renameStatus.className='bpd-awards-guidance';renameStatus.textContent='Naam opslaan en loggen…';
     try{
      const token=await auth.currentUser.getIdToken();
      const res=await fetch('/api/personnel-awards/catalog-label/'+encodeURIComponent(id),{
       method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
       body:JSON.stringify({label,reason})
      });
      const result=await res.json().catch(()=>({}));
      if(!res.ok||result.saved!==true)throw Error(result.error||'Naam niet opgeslagen');
      labels.set(id,{...labels.get(id),label});renameReason.value='';
      const selected=catalogPick.selectedOptions[0];if(selected)selected.textContent=label;
      document.dispatchEvent(new CustomEvent('bpd-decoration-renamed',{detail:{id,label}}));
      renameStatus.className='bpd-awards-success';
      renameStatus.textContent='Naam opgeslagen. Alle bestaande toekenningen behouden hun koppeling.';
      if(typeof onChange==='function')await onChange();
     }catch(error){
      renameStatus.className='bpd-awards-error';renameStatus.textContent=error.message;
     }finally{renameButton.disabled=false}
    });
   }catch(error){
    renameButton.disabled=true;
    renameStatus.className='bpd-awards-error';renameStatus.textContent=error.message;
   }
  }catch(_){/* Hide upload controls without verified police permissions. */}
 }
 window.BPDDecorations=Object.freeze({renderAwards,uniformRack,manager,uploadTools});
})();
