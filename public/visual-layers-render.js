// Purely visual per-service layers; never grants badges, medals or permissions.
(function(){
 'use strict';
 let active=new Map(),layers=[],visibilityByDept=new Map();
 const allowed=new Set(['helmet','profession','logo','pictogram','patch','specialty','medal','award']);
 const keyPattern=/^(?:medal|helmet|profession|logo|pictogram|patch|award|specialty)_(?:politie|brandweer|ambulance|depannage|burger|beveiliging)_[a-z0-9][a-z0-9_]{0,39}$/;
 const urlPattern=/^\/api\/role-artwork\/file\/(?:medal|helmet|profession|logo|pictogram|patch|award|specialty)_(?:politie|brandweer|ambulance|depannage|burger|beveiliging)_[a-z0-9][a-z0-9_]{0,39}\?v=[a-zA-Z0-9-]+$/;
 const code=s=>String(s||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
 function setData(artworks,config,visibility=[]){
  const data=new Map(),current=[];
  for(const row of Array.isArray(artworks)?artworks:[]){
   if(!keyPattern.test(row?.key||'')||!urlPattern.test(row?.imageUrl||''))continue;
   data.set(row.key,{url:row.imageUrl,kind:row.kind,department:row.department,code:row.code});
  }
  for(const l of Array.isArray(config)?config:[]){
   if(!allowed.has(l.kind)||!data.has(l.assetKey)||l.visible!==true)continue;
   if(l.department!==data.get(l.assetKey).department||l.kind!==data.get(l.assetKey).kind)continue;
   if(!['left','top','width','height','zIndex'].every(k=>Number.isFinite(l[k])))continue;
   if(l.left<0||l.top<0||l.width<2||l.height<2||l.left+l.width>100||l.top+l.height>100||
    l.zIndex<1||l.zIndex>20)continue;
   current.push({...l,src:data.get(l.assetKey).url});
  }
  active=data;layers=current;
  visibilityByDept=new Map((Array.isArray(visibility)?visibility:[])
   .filter(row=>['brandweer_default','ambulance_default','depannage_default'].includes(row?.key))
   .map(row=>[row.department,row]));
 }
 function layerAllowed(department,kind){
  const settings=visibilityByDept.get(department);
  if(!settings)return true;
  if(kind==='helmet')return settings.showHelmet!==false;
  if(kind==='profession')return settings.showProfessionBadge!==false;
  if(['logo','pictogram','patch','specialty'].includes(kind))
   return settings.showExtraLogo!==false;
  // Medals and awards require individual assignment, not a generic logo toggle.
  return true;
 }
 function hasAssignment(person,layer){
  if(layer.code==='default'&&!['medal','award','specialty'].includes(layer.kind))return true;
  const specialties=(Array.isArray(person.specialties)?person.specialties:[])
   .map(s=>code(typeof s==='string'?s:s?.name||s?.label));
  if(['medal','award'].includes(layer.kind)){
   // Medals are never auto-awarded; only trusted explicit award data can show them.
   return Array.isArray(person.awards)&&person.awards.some(a=>
    code(typeof a==='string'?a:a?.code||a?.id||a?.name)===layer.code);
  }
  if(layer.kind==='specialty')return specialties.includes(layer.code);
  // Medical qualifications are display identities, not personnel grades.
  if(layer.kind==='profession'&&person.dept==='ambulance'&&
   window.BPDUniformAssignments?.forPerson?.(person)?.profession===layer.code)return true;
  return code(person.rank)===layer.code||specialties.includes(layer.code);
 }
 function hasProfessionLayer(person,variant){
  const visual=window.BPDUniformAssignments?.forPerson?.(person);
  return Boolean(visual?.elementUrls?.profession)&&
   visual?.visualLayout?.profession?.visible!==false&&layerAllowed(person.dept,'profession');
 }
 function appendTo(stage,person,variant){
  if(!stage||!person)return;
  const drawn=new Set();
  for(const layer of layers){
   if(layer.department!==person.dept||layer.variant!==variant||
    !layerAllowed(person.dept,layer.kind))continue;
   // Explicit library selection overrides automatic rank/specialty/default matching.
   // It does not apply to awards: those always need real personnel award data.
   const selected=window.BPDUniformAssignments?.forPerson?.(person)?.elementCodes?.[layer.kind];
   if(layer.kind==='specialty'){
    // A display rule must never impersonate an actual earned specialization.
    if(!hasAssignment(person,layer))continue;
   }else if(selected?layer.code!==selected:!hasAssignment(person,layer))continue;
   const placement=window.BPDUniformAssignments?.forPerson?.(person)?.visualLayout?.[layer.kind];
   if(placement?.visible===false)continue;
   const at=placement||layer;
   const wrapper=document.createElement('span');
   wrapper.className='bpd-custom-uniform-layer';
   wrapper.style.cssText='position:absolute;pointer-events:none;display:block;overflow:hidden;'+
    'left:'+at.left+'%;top:'+at.top+'%;width:'+at.width+'%;height:'+at.height+
    '%;z-index:'+layer.zIndex+';';
   const img=document.createElement('img');
   img.src=layer.src;img.alt='';img.loading='lazy';
   img.style.cssText='display:block;width:100%;height:100%;object-fit:contain';
   wrapper.append(img);stage.append(wrapper);drawn.add(layer.kind);
  }
  // One sensible initial placement per type when no custom layer was configured.
  // No manual badge-to-coat linking is required. Managers can later refine
  // positions in Uniformbeheer > Extra lagen.
  const selected=window.BPDUniformAssignments?.forPerson?.(person);
  const defaults={
   helmet:{left:19,top:2,width:62,height:34,zIndex:9},
   profession:{left:52,top:43,width:23,height:13,zIndex:9},
   logo:{left:72,top:26,width:14,height:14,zIndex:9}
  };
  for(const [kind,position] of Object.entries(defaults)){
   const url=selected?.elementUrls?.[kind];
   if(selected?.visualLayout?.[kind]?.visible===false)continue;
   const coords=selected?.visualLayout?.[kind]||position;
   if(!url||drawn.has(kind)||!layerAllowed(person.dept,kind)||
    (kind==='helmet'&&person.dept!=='brandweer')||
    (kind==='profession'&&person.dept!=='ambulance'))continue;
   const frame=document.createElement('span');
   frame.className='bpd-custom-uniform-layer';
   frame.style.cssText='position:absolute;pointer-events:none;display:block;overflow:hidden;'+
    'left:'+coords.left+'%;top:'+coords.top+'%;width:'+coords.width+'%;height:'+
    coords.height+'%;z-index:'+position.zIndex+';';
   const img=document.createElement('img');
   img.src=url;img.alt='';img.loading='lazy';
   img.style.cssText='display:block;width:100%;height:100%;object-fit:contain';
   frame.append(img);stage.append(frame);
  }
 }
 function baseIcon(dept){
  const e=active.get('pictogram_'+dept+'_default');
  return e?.url||null;
 }
 window.BPDVisualAssets=Object.freeze({setData,appendTo,baseIcon,hasProfessionLayer});
})();
