/* Shared site appearance. Data comes from a public, read-only projection:
 * the privileged edit endpoint is never called by ordinary visitors. */
(function(){
 'use strict';
 const allowed={
  themeDefault:['light','dark'],accent:['blue','teal','violet','amber'],
  fontFamily:['inter','system','arial','serif'],
  density:['compact','normal','comfortable']
 };
 const defaults={themeDefault:'light',accent:'blue',fontFamily:'inter',
  density:'normal',fontScale:100};
 let saved={...defaults};
 function sanitize(raw){
  const v=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const clean={};
  for(const [key,options] of Object.entries(allowed))
    clean[key]=options.includes(v[key])?v[key]:defaults[key];
  clean.fontScale=Number.isSafeInteger(v.fontScale)&&
    v.fontScale>=90&&v.fontScale<=120?v.fontScale:100;
  return clean;
 }
 function stylesheet(){
  if(document.getElementById('bpdVisualDesignSheet'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='/bpd-visual-design.css';
  link.id='bpdVisualDesignSheet';
  document.head.append(link);
 }
 function apply(raw,{preview=false}={}){
  const config=sanitize(raw),root=document.documentElement;
  stylesheet();
  root.dataset.bpdDesignAccent=config.accent;
  root.dataset.bpdDesignFont=config.fontFamily;
  root.dataset.bpdDesignScale=String(config.fontScale);
  root.dataset.bpdDesignDensity=config.density;
  window.dispatchEvent(new CustomEvent('bpd:visual-design-default',{
    detail:{themeDefault:config.themeDefault,preview:preview===true}
  }));
  return config;
 }
 async function reload(){
  try{
   const response=await fetch('/api/visual-design/public',{cache:'no-store'});
   if(!response.ok)throw Error('No public visual design');
   const payload=await response.json();
   saved=sanitize(payload.settings);
  }catch{
   // Never prevent a visitor from using the portal after a config outage.
   saved={...defaults};
  }
  return apply(saved);
 }
 window.BPDVisualDesign={
  apply,reload,restore:()=>apply(saved),getSaved:()=>({...saved})
 };
 stylesheet();
 // No identity or dossier data is transmitted with this public read.
 void reload();
})();
