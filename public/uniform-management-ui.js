// BelgiumPD uniform preview/editor. Uniforms and grade coordinates are strictly visual.
export function setupUniformManagementUI({api,$,notice}){
 const DEPTS=[['politie','Politie'],['brandweer','Brandweer'],
  ['ambulance','Ambulance'],['depannage','Depannage'],['burger','Burger']];
 const names=Object.fromEntries(DEPTS);
 const $p=id=>$(id),dept=$p('uniformDept'),variant=$p('uniformVariant');
 const frame=$p('uniformPreviewFrame'),coat=$p('uniformPreviewCoat');
 const patch=$p('uniformPreviewPatch'),patchLabel=$p('uniformPreviewPatchLabel');
 const nameplate=$p('uniformPreviewNameplate');
 const gradePreview=$p('uniformGradePreview'),gradePicture=$p('uniformPreviewGradeImage');
 const status=$p('uniformStatus'),reason=$p('uniformReason');
 const x=$p('uniformX'),y=$p('uniformY'),w=$p('uniformW'),h=$p('uniformH');
 const nx=$p('uniformNameX'),ny=$p('uniformNameY');
 const nw=$p('uniformNameW'),nh=$p('uniformNameH');
 const cx=$p('uniformCoatX'),cy=$p('uniformCoatY'),cz=$p('uniformCoatZoom');
 const nf=$p('uniformNameFont'),cf=$p('uniformCallFont');
 const prefix=$p('uniformNamePrefix'),exampleName=$p('uniformNameExample'),
  exampleCall=$p('uniformCallExample');
 let layouts=new Map(),nameLayouts=new Map(),coatLayouts=new Map(),images=new Map(),rankAssets=[],authorized=[],drag=null,imageData='';
 const defaults={
  politie_silver:{left:62.3,top:56.75,width:26.6,height:12.25},
  politie_gold:{left:56.2,top:58.9,width:19.5,height:12.1}
 };
 const defaultFor=key=>defaults[key]||{left:62,top:55,width:24,height:12};
 const nameDefaults={
  politie_silver:{left:10.25,top:56.2,width:27.75,height:13.15},
  politie_gold:{left:21.2,top:58.9,width:20.1,height:12.1}
 };
 const nameDefaultFor=key=>nameDefaults[key]||{left:11,top:55,width:27,height:12};
 const prefixFor=()=>({politie:'BELGIEPD',brandweer:'BRANDWEER',
  ambulance:'AZLS',depannage:'DEPANNAGE',burger:'BURGER'})[dept.value]||'BELGIEPD';
 const key=()=>dept.value+'_'+variant.value;
 const imageKey=()=> 'uniform_'+key();
 const builtin=()=>dept.value==='politie'?
  variant.value==='gold'?'/assets/bpd-gold-officer-corps-zonder-medaille-rood-20261029.svg':
   '/assets/bpd-uniform-zilver-zonder-medaille-rood-20261029.svg':'';
 const message=(s,error=false)=>{status.textContent=s;status.classList.toggle('error',error)};
 function updateGradeChoices(){
  const previous=gradePreview.value;
  gradePreview.replaceChildren(new Option('Voorbeeld zonder officiële afbeelding',''));
  const custom=rankAssets.filter(a=>a.department===dept.value&&a.active);
  for(const row of custom)gradePreview.append(new Option(row.label+' ('+row.code+')',row.imageUrl));
  if(dept.value==='politie'){
   const builtin=variant.value==='gold'?
    [['Aspirant-commissaris','/assets/bpd-rank-acp-clean-20261027.webp'],
     ['Commissaris','/assets/bpd-rank-cp-clean-20261027.webp']]:
    [['Aspirant-hoofdinspecteur','/assets/bpd-rank-ahinp-clean-20261027.webp'],
     ['Inspecteur','/assets/bpd-rank-inp-clean-20261027.webp']];
   for(const [name,url] of builtin)gradePreview.append(new Option(name+' · voorbeeld',url));
  }
  gradePreview.value=[...gradePreview.options].some(o=>o.value===previous)?previous:
   (gradePreview.options[1]?.value||'');
 }
 gradePreview.addEventListener('change',render);
 function render(){
  coat.style.transform='translate('+cx.value+'%,'+cy.value+'%) scale('+(Number(cz.value)/100)+')';
  for(const [label,control] of [['X',cx],['Y',cy],['Zoom',cz]]){
   const value=Number(control.value).toFixed(label==='Zoom'?0:1)+'%';
   const dest=$p('uniformCoatValue'+label);dest.value=value;dest.textContent=value;
  }
  const nameText=$p('uniformPreviewName'),callText=$p('uniformPreviewCall');
  nameText.textContent=exampleName.value.trim()||'VOORBEELD NAAM';
  callText.textContent=(prefix.value.trim()||prefixFor())+' · '+(exampleCall.value.trim()||'610');
  nameText.style.transform='scale('+(Number(nf.value)/100)+')';
  callText.style.transform='scale('+(Number(cf.value)/100)+')';
  for(const [label,control]of [['uniformNameFontValue',nf],['uniformCallFontValue',cf]]){
   const target=$p(label),value=Number(control.value).toFixed(0)+'%';
   target.value=value;target.textContent=value;
  }
  const changed={left:Number(x.value),top:Number(y.value),
   width:Number(w.value),height:Number(h.value)};
  patch.style.left=changed.left+'%';patch.style.top=changed.top+'%';
  patch.style.width=changed.width+'%';patch.style.height=changed.height+'%';
  nameplate.style.left=nx.value+'%';nameplate.style.top=ny.value+'%';
  nameplate.style.width=nw.value+'%';nameplate.style.height=nh.value+'%';
  nameplate.classList.toggle('gold',dept.value==='politie'&&variant.value==='gold');
  nameplate.classList.toggle('silver',dept.value!=='politie'||variant.value==='silver');
  $p('uniformPreviewCall').textContent=dept.value==='politie'?'BELGIEPD · 610':
   names[dept.value].toUpperCase()+' · 001';
  for(const [label,control] of [['X',nx],['Y',ny],['W',nw],['H',nh]]){
   const value=Number(control.value).toFixed(1)+'%';
   $p('uniformNameValue'+label).value=value;
   $p('uniformNameValue'+label).textContent=value;
  }
  const gradeSrc=gradePreview.value;
  gradePicture.hidden=!gradeSrc;
  gradePicture.src=gradeSrc||'';
  patchLabel.hidden=Boolean(gradeSrc);
  patchLabel.textContent='Voorbeeld gradenplaat';
  for(const [label,value] of [['X',changed.left],['Y',changed.top],
   ['W',changed.width],['H',changed.height]]){
   $p('uniformValue'+label).value=value.toFixed(1)+'%';
   $p('uniformValue'+label).textContent=value.toFixed(1)+'%';
  }
  const url=imageData||images.get(imageKey())||builtin();
  coat.hidden=!url;coat.src=url||'';
  frame.classList.toggle('uniform-empty',!url);
 }
 function useLayout(){
  imageData='';$p('uniformFile').value='';
  const pos=layouts.get(key())||defaultFor(key());
  x.value=pos.left;y.value=pos.top;w.value=pos.width;h.value=pos.height;
  const namePos=nameLayouts.get(key())||nameDefaultFor(key());
  nx.value=namePos.left;ny.value=namePos.top;nw.value=namePos.width;nh.value=namePos.height;
  nf.value=namePos.nameScale??100;cf.value=namePos.callScale??100;
  prefix.value=namePos.prefix||prefixFor();
  const coatPos=coatLayouts.get(key())||{offsetX:0,offsetY:0,zoom:100};
  cx.value=coatPos.offsetX;cy.value=coatPos.offsetY;cz.value=coatPos.zoom;
  updateGradeChoices();render();
 }
 function variants(){
  variant.replaceChildren();
  for(const [value,label] of dept.value==='politie'?
   [['silver','Zilveren uniform · Agenten/Basis/Midden'],['gold','Gouden uniform · Officieren/Korpsleiding']]:
   [['default',names[dept.value]+' · Uniform']])
   variant.append(new Option(label,value));
  useLayout();
 }
 for(const [value,label]of DEPTS)dept.append(new Option(label,value));
 dept.onchange=variants;variant.onchange=useLayout;
 const constrain=()=>{
  const width=Number(w.value),height=Number(h.value);
  if(Number(x.value)+width>100)x.value=String(Math.max(0,100-width));
  if(Number(y.value)+height>100)y.value=String(Math.max(0,100-height));
  render();
 };
 [x,y,w,h].forEach(t=>t.addEventListener('input',constrain));
 const constrainName=()=>{
  const width=Number(nw.value),height=Number(nh.value);
  if(Number(nx.value)+width>100)nx.value=String(Math.max(0,100-width));
  if(Number(ny.value)+height>100)ny.value=String(Math.max(0,100-height));
  render();
 };
 [nx,ny,nw,nh].forEach(t=>t.addEventListener('input',constrainName));
 [cx,cy,cz,nf,cf,prefix,exampleName,exampleCall].forEach(
  control=>control.addEventListener('input',render)
 );
 // Drag the empty uniform area without stealing nameplate/grade pointer events.
 frame.addEventListener('pointerdown',e=>{
  if(e.button>0||e.target.closest('#uniformPreviewNameplate,#uniformPreviewPatch'))return;
  drag={id:e.pointerId,which:'coat',startX:e.clientX,startY:e.clientY,
   x:Number(cx.value),y:Number(cy.value)};
  frame.setPointerCapture(e.pointerId);e.preventDefault();
 });
 frame.addEventListener('pointermove',e=>{
  if(!drag||drag.which!=='coat'||drag.id!==e.pointerId)return;
  const rect=frame.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  cx.value=String(Math.max(-50,Math.min(50,
   drag.x+(e.clientX-drag.startX)*100/rect.width)));
  cy.value=String(Math.max(-50,Math.min(50,
   drag.y+(e.clientY-drag.startY)*100/rect.height)));
  render();e.preventDefault();
 });
 const stopCoat=e=>{if(drag?.id===e.pointerId&&drag.which==='coat')drag=null};
 frame.addEventListener('pointerup',stopCoat);
 frame.addEventListener('pointercancel',stopCoat);
 frame.addEventListener('lostpointercapture',stopCoat);
 frame.tabIndex=0;
 frame.addEventListener('keydown',e=>{
  if(e.target!==frame)return;
  const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(!move)return;
  e.preventDefault();const speed=e.shiftKey?3:0.5;
  cx.value=String(Math.max(-50,Math.min(50,Number(cx.value)+move[0]*speed)));
  cy.value=String(Math.max(-50,Math.min(50,Number(cy.value)+move[1]*speed)));
  render();
 });
 nameplate.addEventListener('pointerdown',e=>{
  if(e.button>0)return;
  drag={id:e.pointerId,which:'nameplate',startX:e.clientX,startY:e.clientY,
   x:Number(nx.value),y:Number(ny.value)};
  nameplate.setPointerCapture(e.pointerId);e.preventDefault();
 });
 nameplate.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId||drag.which!=='nameplate')return;
  const rect=frame.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  nx.value=String(Math.max(0,Math.min(100-Number(nw.value),
   drag.x+(e.clientX-drag.startX)*100/rect.width)));
  ny.value=String(Math.max(0,Math.min(100-Number(nh.value),
   drag.y+(e.clientY-drag.startY)*100/rect.height)));
  render();e.preventDefault();
 });
 nameplate.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null});
 nameplate.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)drag=null});
 nameplate.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)drag=null});
 nameplate.addEventListener('keydown',e=>{
  const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(!moves[e.key])return;
  e.preventDefault();const step=e.shiftKey?3:0.5;
  nx.value=String(Math.max(0,Math.min(100-Number(nw.value),
   Number(nx.value)+moves[e.key][0]*step)));
  ny.value=String(Math.max(0,Math.min(100-Number(nh.value),
   Number(ny.value)+moves[e.key][1]*step)));
  render();
 });
 patch.addEventListener('pointerdown',e=>{
  if(e.button>0)return;
  drag={id:e.pointerId,which:'grade',startX:e.clientX,startY:e.clientY,
   x:Number(x.value),y:Number(y.value)};
  patch.setPointerCapture(e.pointerId);e.preventDefault();
 });
 patch.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId||drag.which!=='grade')return;
  const rect=frame.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  x.value=String(Math.max(0,Math.min(100-Number(w.value),
   drag.x+(e.clientX-drag.startX)*100/rect.width)));
  y.value=String(Math.max(0,Math.min(100-Number(h.value),
   drag.y+(e.clientY-drag.startY)*100/rect.height)));
  render();e.preventDefault();
 });
 const end=e=>{if(drag?.id===e.pointerId)drag=null};
 patch.addEventListener('pointerup',end);
 patch.addEventListener('pointercancel',end);
 patch.addEventListener('lostpointercapture',end);
 patch.addEventListener('keydown',e=>{
  const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(!moves[e.key])return;
  e.preventDefault();const step=e.shiftKey?3:0.5;
  x.value=String(Math.max(0,Math.min(100-Number(w.value),
   Number(x.value)+moves[e.key][0]*step)));
  y.value=String(Math.max(0,Math.min(100-Number(h.value),
   Number(y.value)+moves[e.key][1]*step)));
  render();
 });
 $p('uniformReset').onclick=()=>{
  const pos=defaultFor(key());
  x.value=pos.left;y.value=pos.top;w.value=pos.width;h.value=pos.height;
  render();message('Standaardpositie geselecteerd. Klik Positie bewaren om ze toe te passen.');
 };
 $p('uniformNameReset').onclick=()=>{
  const pos=nameDefaultFor(key());
  nx.value=pos.left;ny.value=pos.top;nw.value=pos.width;nh.value=pos.height;
  nf.value=cf.value=100;prefix.value=prefixFor();
  render();message('Standaardpositie naamplaat geselecteerd. Klik Naamplaat bewaren om ze toe te passen.');
 };
 $p('uniformCoatReset').onclick=()=>{
  cx.value=cy.value=0;cz.value=100;render();
  message('Uniform gecentreerd. Klik Uniformpositie en grootte bewaren.');
 };
 $p('uniformFile').addEventListener('change',async()=>{
  const file=$p('uniformFile').files?.[0];
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){
   message('Gebruik PNG, JPG of WebP van maximaal 5 MB.',true);return;
  }
  const blob=URL.createObjectURL(file);
  try{
   const img=new Image();img.src=blob;await img.decode();
   if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth>8192||img.naturalHeight>8192)
    throw Error('Afbeeldingsafmetingen zijn ongeldig');
   const canvas=document.createElement('canvas');
   canvas.width=603;canvas.height=469;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Voorbeeldverwerking niet beschikbaar');
   const scale=Math.max(603/img.naturalWidth,469/img.naturalHeight);
   const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
   ctx.drawImage(img,(603-iw)/2,(469-ih)/2,iw,ih);
   imageData='';
   for(const q of [.9,.75,.55,.42]){
    const data=canvas.toDataURL('image/webp',q);
    if(data.startsWith('data:image/webp;base64,')&&data.length<180000){
     imageData=data;break;
    }
   }
   if(!imageData)throw Error('Uniform is te groot; kies een afbeelding met minder details.');
   coat.src=imageData;coat.hidden=false;
   frame.classList.remove('uniform-empty');
   message('Uniform geladen in het voorbeeld. Klik Uniform bewaren om de afbeelding te publiceren.');
  }catch(e){imageData='';message(e.message,true)}
  finally{URL.revokeObjectURL(blob)}
 });
 async function reload(){
  const previousDept=dept.value,previousVariant=variant.value;
  const [positions,assets]=await Promise.all([
   api('/api/uniform-management/layouts'),
   api('/api/role-artwork/manage')
  ]);
  layouts=new Map((positions.layouts||[]).map(r=>[r.key,r]));
  nameLayouts=new Map((positions.nameplates||[]).map(r=>[r.key,r]));
  coatLayouts=new Map((positions.coats||[]).map(r=>[r.key,r]));
  images=new Map((assets.artworks||[]).filter(a=>a.active&&a.kind==='uniform')
   .map(a=>[a.key,a.imageUrl]));
  rankAssets=(assets.artworks||[]).filter(a=>a.kind==='rank'&&a.active);
  authorized=positions.editableDepartments||[];
  dept.replaceChildren();
  for(const [value,label] of DEPTS)
   if(authorized.includes(value))dept.append(new Option(label,value));
  if(!dept.options.length)throw Error('Geen hulpdienst met uniformbeheerrechten.');
  if(authorized.includes(previousDept))dept.value=previousDept;
  variants();
  if([...variant.options].some(o=>o.value===previousVariant)){
   variant.value=previousVariant;useLayout();
  }
  message('Uniformbeheer geladen. Wijzigingen zijn pas actief na bewaren.');
 }
 $p('uniformReload').onclick=()=>reload().catch(e=>message(e.message,true));
 $p('uniformSaveImage').onclick=async()=>{
  if(!imageData){message('Selecteer eerst een nieuwe uniformafbeelding.',true);return}
  const motivation=reason.value.trim();
  if(motivation.length<8){message('Geef een motivering van minstens 8 tekens.',true);return}
  const button=$p('uniformSaveImage');button.disabled=true;
  try{
   await api('/api/role-artwork/personnel',{method:'PUT',body:{
    kind:'uniform',department:dept.value,code:variant.value,
    label:names[dept.value]+' · '+variant.selectedOptions[0]?.textContent,
    reason:motivation,dataUrl:imageData}});
   message('Uniformafbeelding gepubliceerd; bestaande graad- en functieplaatjes blijven behouden.');
   await reload();
  }catch(e){message('Uniform bewaren mislukt: '+e.message,true)}
  finally{button.disabled=false}
 };
 $p('uniformSaveCoat').onclick=async()=>{
  const motivation=reason.value.trim();
  if(motivation.length<8){message('Geef een motivering van minstens 8 tekens.',true);return}
  const values={department:dept.value,variant:variant.value,
   offsetX:Number(cx.value),offsetY:Number(cy.value),zoom:Number(cz.value),reason:motivation};
  const button=$p('uniformSaveCoat');button.disabled=true;
  try{
   await api('/api/uniform-management/coat',{method:'PUT',body:values});
   coatLayouts.set(key(),{...values,configured:true});
   message('Uniformpositie en grootte opgeslagen. Naamplaat en gradenplaat blijven apart instelbaar.');
  }catch(e){message('Uniformpositie bewaren mislukt: '+e.message,true)}
  finally{button.disabled=false}
 };
 $p('uniformSaveNameplate').onclick=async()=>{
  const motivation=reason.value.trim();
  if(motivation.length<8){message('Geef een motivering van minstens 8 tekens.',true);return}
  const values={department:dept.value,variant:variant.value,
   left:Number(nx.value),top:Number(ny.value),width:Number(nw.value),height:Number(nh.value),
   nameScale:Number(nf.value),callScale:Number(cf.value),prefix:prefix.value.trim(),
   reason:motivation};
  const button=$p('uniformSaveNameplate');button.disabled=true;
  try{
   await api('/api/uniform-management/nameplate',{method:'PUT',body:values});
   nameLayouts.set(key(),{...values,configured:true});
   message('Naamplaat, tekstgroottes en opschrift opgeslagen. De gradenplaat blijft ongewijzigd.');
  }catch(e){message('Naamplaat bewaren mislukt: '+e.message,true)}
  finally{button.disabled=false}
 };
 $p('uniformSavePosition').onclick=async()=>{
  const motivation=reason.value.trim();
  if(motivation.length<8){message('Geef een motivering van minstens 8 tekens.',true);return}
  const values={department:dept.value,variant:variant.value,
   left:Number(x.value),top:Number(y.value),width:Number(w.value),height:Number(h.value),
   reason:motivation};
  const button=$p('uniformSavePosition');button.disabled=true;
  try{
   await api('/api/uniform-management/layout',{method:'PUT',body:values});
   layouts.set(key(),values);message('De plaats en afmetingen van het gradenteken zijn opgeslagen.');
  }catch(e){message('Positie bewaren mislukt: '+e.message,true)}
  finally{button.disabled=false}
 };
 return {load:async()=>{
  try{await reload();$p('uniformSection').dataset.authorized='yes'}
  catch(e){$p('uniformSection').dataset.authorized='no';message(e.message,true)}
 }};
}
