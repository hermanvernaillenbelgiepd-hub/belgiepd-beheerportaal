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
 // Each awarded medal carries its small ribbon ABOVE the rank and a
 // hanging pendant BELOW it. Ribbon-only distinctions have no pendant.
 function hangingMedal(item){
  const medal=node('span','bpd-hanging-medal');
  medal.dataset.catalog=['kroon_blauw','ereteken_zilver','ereteken_rood',
    'dienstmedaille_zilver','dienstmedaille_goud'].includes(item.id)?item.id:'other';
  medal.title=String(item.label||'Onderscheiding').slice(0,90);
  const fabric=node('span','bpd-medal-hanger');
  fabric.dataset.color=item.color;
  const pendant=node('span','bpd-medal-pendant',
    item.id==='kroon_blauw'?'♛':item.id==='ereteken_rood'||item.id==='ereteken_zilver'?'✦':'✧');
  medal.append(fabric,pendant);
  return medal;
 }
 function uniformRack(awards){
  const valid=(Array.isArray(awards)?awards:[])
   .filter(x=>x&&typeof x==='object'&&typeof x.color==='string'&&
    ['ribbon','medal','badge'].includes(x.kind))
   .sort((a,b)=>(Number(a.priority)||999)-(Number(b.priority)||999));
  if(!valid.length)return null;
  const top=node('span','bpd-uniform-ribbons');
  top.setAttribute('aria-hidden','true');
  valid.slice(0,4).forEach(x=>top.append(ribbon(x)));
  const medals=valid.filter(x=>x.kind==='medal').slice(0,3);
  let bottom=null;
  if(medals.length){
   bottom=node('span','bpd-uniform-medals');
   bottom.setAttribute('aria-hidden','true');
   medals.forEach(x=>bottom.append(hangingMedal(x)));
  }
  return {top,bottom};
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
   if(response.status===403||response.status===401||response.status===404)return;
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.canManage||!Array.isArray(data.catalog))return;
   if(auth.currentUser?.uid!==ownerUid||!root.isConnected||root.dataset.personKey!==identity)return;
   const panel=node('details','bpd-awards-control');
   panel.append(node('summary','','Onderscheiding toekennen / intrekken · Officierenkader en Korpsleiding'));
   const catalogue=node('select');
   data.catalog.forEach(item=>{
    const o=node('option','',item.label);o.value=item.id;catalogue.append(o);
   });
   panel.append(node('label','','Onderscheiding'),catalogue);
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
 window.BPDDecorations=Object.freeze({renderAwards,uniformRack,manager});
})();
