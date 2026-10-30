// BelgiumPD uniform preview/editor. Uniforms and grade coordinates are strictly visual.
export function setupUniformManagementUI({api,$,notice}){
 const DEPTS=[['politie','Politie'],['brandweer','Brandweer'],
  ['ambulance','Ambulance'],['depannage','Depannage'],['burger','Burger']];
 const names=Object.fromEntries(DEPTS);
 const $p=id=>$(id),dept=$p('uniformDept'),variant=$p('uniformVariant');
 const frame=$p('uniformPreviewFrame'),coat=$p('uniformPreviewCoat');
 const patch=$p('uniformPreviewPatch'),patchLabel=$p('uniformPreviewPatchLabel');
 const status=$p('uniformStatus'),reason=$p('uniformReason');
 const x=$p('uniformX'),y=$p('uniformY'),w=$p('uniformW'),h=$p('uniformH');
 let layouts=new Map(),images=new Map(),authorized=[],drag=null,imageData='';
 const defaults={
  politie_silver:{left:62.3,top:56.75,width:26.6,height:12.25},
  politie_gold:{left:56.2,top:58.9,width:19.5,height:12.1}
 };
 const defaultFor=key=>defaults[key]||{left:62,top:55,width:24,height:12};
 const key=()=>dept.value+'_'+variant.value;
 const imageKey=()=> 'uniform_'+key();
 const builtin=()=>dept.value==='politie'?
  variant.value==='gold'?'/assets/bpd-gold-officer-corps-zonder-medaille-rood-20261029.svg':
   '/assets/bpd-uniform-zilver-zonder-medaille-rood-20261029.svg':'';
 const message=(s,error=false)=>{status.textContent=s;status.classList.toggle('error',error)};
 function render(){
  const values=layouts.get(key())||defaultFor(key());
  const changed={left:Number(x.value),top:Number(y.value),
   width:Number(w.value),height:Number(h.value)};
  patch.style.left=changed.left+'%';patch.style.top=changed.top+'%';
  patch.style.width=changed.width+'%';patch.style.height=changed.height+'%';
  patchLabel.textContent='Voorbeeld gradenplaat';
  for(const [label,value] of [['X',changed.left],['Y',changed.top],
   ['W',changed.width],['H',changed.height]]){
   $p('uniformValue'+label).value=value.toFixed(1)+'%';
   $p('uniformValue'+label).textContent=value.toFixed(1)+'%';
  }
  const url=images.get(imageKey())||builtin();
  coat.hidden=!url;coat.src=url||'';
  frame.classList.toggle('uniform-empty',!url);
  $p('uniformFile').value='';
  imageData='';
 }
 function useLayout(){
  const pos=layouts.get(key())||defaultFor(key());
  x.value=pos.left;y.value=pos.top;w.value=pos.width;h.value=pos.height;
  render();
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
 patch.addEventListener('pointerdown',e=>{
  if(e.button>0)return;
  drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,
   x:Number(x.value),y:Number(y.value)};
  patch.setPointerCapture(e.pointerId);e.preventDefault();
 });
 patch.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
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
  const [positions,assets]=await Promise.all([
   api('/api/uniform-management/layouts'),
   api('/api/role-artwork/manage')
  ]);
  layouts=new Map((positions.layouts||[]).map(r=>[r.key,r]));
  images=new Map((assets.artworks||[]).filter(a=>a.active&&a.kind==='uniform')
   .map(a=>[a.key,a.imageUrl]));
  authorized=positions.editableDepartments||[];
  dept.replaceChildren();
  for(const [value,label] of DEPTS)
   if(authorized.includes(value))dept.append(new Option(label,value));
  if(!dept.options.length)throw Error('Geen hulpdienst met uniformbeheerrechten.');
  variants();
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
