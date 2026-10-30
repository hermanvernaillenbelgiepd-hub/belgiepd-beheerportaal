// Attached image layers are presentation-only. Never grant a medal or permission.
export function setupVisualLayerUI({api,$}){
 const kinds=new Set(['medal','helmet','profession','logo','pictogram','patch','award','specialty']);
 const dept=$('uniformDept'),variant=$('uniformVariant'),frame=$('uniformPreviewFrame');
 const asset=$('visualLayerAsset'),variantSelect=$('visualLayerVariant');
 const preview=$('uniformLayerPreview'),previewImg=$('uniformLayerImage');
 const control=$('visualLayerControls'),status=$('visualLayerStatus');
 const fields={
  left:$('visualLayerX'),top:$('visualLayerY'),
  width:$('visualLayerW'),height:$('visualLayerH'),
  zIndex:$('visualLayerZ')
 };
 const visible=$('visualLayerVisible');
 let artworks=[],layers=new Map(),selected=null,drag=null;
 const message=(s,bad=false)=>{status.textContent=s;status.classList.toggle('error',bad)};
 const selectedKey=()=>selected?
  selected.key+'_v_'+variantSelect.value:'';
 const defaults={
  helmet:{left:23,top:4,width:54,height:40,zIndex:9},
  profession:{left:64,top:52,width:20,height:12,zIndex:8},
  logo:{left:61,top:55,width:24,height:12,zIndex:8},
  pictogram:{left:18,top:12,width:64,height:64,zIndex:8},
  patch:{left:66,top:68,width:21,height:11,zIndex:8},
  specialty:{left:66,top:68,width:21,height:11,zIndex:8},
  medal:{left:44,top:54,width:16,height:15,zIndex:9},
  award:{left:44,top:54,width:16,height:15,zIndex:9}
 };
 const validVariants=()=>dept.value==='politie'?['silver','gold']:['default'];
 function updateVariants(){
  const old=variantSelect.value;
  variantSelect.replaceChildren();
  for(const v of validVariants())variantSelect.add(new Option(
   v==='silver'?'Zilveren uniform':v==='gold'?'Gouden uniform':'Standaarduniform',v));
  variantSelect.value=validVariants().includes(variant.value)?variant.value:
   validVariants().includes(old)?old:validVariants()[0];
 }
 function setAssetOptions(){
  selected=null;
  asset.replaceChildren(new Option('Kies een geüpload onderdeel',''));
  for(const a of artworks.filter(a=>a.department===dept.value&&a.active&&kinds.has(a.kind))){
   asset.append(new Option(a.label+' · '+a.kind+' ('+a.code+')',a.key));
  }
  preview.hidden=true;control.hidden=true;
  message('Kies een onderdeel om de positie te wijzigen.');
 }
 function getData(){
  const item=layers.get(selectedKey());
  return item||{...(defaults[selected?.kind]||defaults.patch),
   visible:!['medal','award'].includes(selected?.kind)};
 }
 function render(){
  if(!selected)return;
  const data=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,Number(v.value)]));
  preview.style.left=data.left+'%';preview.style.top=data.top+'%';
  preview.style.width=data.width+'%';preview.style.height=data.height+'%';
  preview.style.zIndex=data.zIndex;
  preview.style.opacity=visible.checked?'1':'.55';
  previewImg.src=selected.imageUrl;
  preview.hidden=false;control.hidden=false;
  for(const [key,field]of Object.entries(fields)){
   const out=$('visualLayerValue'+({left:'X',top:'Y',width:'W',height:'H',zIndex:'Z'}[key]));
   const val=Number(field.value).toFixed(key==='zIndex'?0:1)+(key==='zIndex'?'':'%');
   out.textContent=val;out.value=val;
  }
 }
 function applySelection(){
  selected=artworks.find(a=>a.key===asset.value&&a.active)||null;
  if(!selected){preview.hidden=true;control.hidden=true;return}
  updateVariants();
  const row=getData();
  for(const [k,field]of Object.entries(fields))field.value=row[k];
  visible.checked=row.visible!==false;
  render();
  message('Sleep de patch op de uniformfoto, stel de grootte in en bewaar de laag.');
 }
 const bound=()=>{
  if(Number(fields.left.value)+Number(fields.width.value)>100)
   fields.left.value=String(Math.max(0,100-Number(fields.width.value)));
  if(Number(fields.top.value)+Number(fields.height.value)>100)
   fields.top.value=String(Math.max(0,100-Number(fields.height.value)));
  render();
 };
 Object.values(fields).forEach(f=>f.addEventListener('input',bound));
 visible.addEventListener('change',render);
 asset.addEventListener('change',applySelection);
 variantSelect.addEventListener('change',applySelection);
 dept.addEventListener('change',()=>{updateVariants();setAssetOptions()});
 variant.addEventListener('change',()=>{
  if(validVariants().includes(variant.value)){
   variantSelect.value=variant.value;if(selected)applySelection();
  }
 });
 preview.addEventListener('pointerdown',e=>{
  if(e.button>0)return;
  drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,
   left:Number(fields.left.value),top:Number(fields.top.value)};
  preview.setPointerCapture(e.pointerId);e.stopPropagation();e.preventDefault();
 });
 preview.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const rect=frame.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  fields.left.value=String(Math.max(0,Math.min(100-Number(fields.width.value),
   drag.left+(e.clientX-drag.startX)*100/rect.width)));
  fields.top.value=String(Math.max(0,Math.min(100-Number(fields.height.value),
   drag.top+(e.clientY-drag.startY)*100/rect.height)));
  render();e.stopPropagation();e.preventDefault();
 });
 for(const evt of ['pointerup','pointercancel','lostpointercapture'])
  preview.addEventListener(evt,e=>{if(drag?.id===e.pointerId)drag=null;e.stopPropagation()});
 preview.addEventListener('keydown',e=>{
  const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(!move)return;
  e.preventDefault();
  fields.left.value=String(Math.max(0,Math.min(100-Number(fields.width.value),
   Number(fields.left.value)+move[0]*(e.shiftKey?3:.5))));
  fields.top.value=String(Math.max(0,Math.min(100-Number(fields.height.value),
   Number(fields.top.value)+move[1]*(e.shiftKey?3:.5))));
  render();
 });
 async function reload(){
  const [catalog,layerData]=await Promise.all([
   api('/api/role-artwork/manage'),api('/api/visual-layers')
  ]);
  artworks=Array.isArray(catalog.artworks)?catalog.artworks:[];
  layers=new Map((layerData.layers||[]).map(r=>[r.key,r]));
  updateVariants();setAssetOptions();
 }
 $('visualLayerReload').addEventListener('click',()=>{
  reload().catch(e=>message(e.message,true))
 });
 $('visualLayerSave').addEventListener('click',async()=>{
  if(!selected)return;
  const reason=$('uniformReason').value.trim();
  if(reason.length<8){message('Geef eerst een motivering van minimaal 8 tekens.',true);return}
  const request={kind:selected.kind,code:selected.code,department:selected.department,
   variant:variantSelect.value,reason,visible:visible.checked};
  for(const [k,field]of Object.entries(fields))request[k]=Number(field.value);
  const btn=$('visualLayerSave');btn.disabled=true;
  try{
   const result=await api('/api/visual-layers',{method:'PUT',body:request});
   layers.set(result.key,{...request,key:result.key});
   message('Laag opgeslagen. Er worden geen medailles of rollen toegekend.');
  }catch(e){message('Opslaan mislukt: '+e.message,true)}
  finally{btn.disabled=false}
 });
 return {load:async()=>{try{await reload()}catch(e){message(e.message,true)}}};
}
