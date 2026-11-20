/* BelgiumPD Page Studio: only strict preset values reach CSS.
 * Operational data, badge colors and permissions are never modified.
 */
(function(){
 'use strict';
 const file=location.pathname.split('/').filter(Boolean).pop()||'index.html';
 if(!/^[a-z][a-z0-9-]{0,62}\.html$/.test(file)||file==='to-dienstbord.html')return;
 const root=document.documentElement;
 root.dataset.bpdDesignPage=file;
 const COLORS=/^#[0-9a-f]{6}$/i;
 const FONTS={inter:'Inter,system-ui,sans-serif',system:'system-ui,sans-serif',
  arial:'Arial,sans-serif',georgia:'Georgia,serif',verdana:'Verdana,sans-serif',
  trebuchet:'"Trebuchet MS",sans-serif',tahoma:'Tahoma,sans-serif'};
 const NUMBERS={radius:[0,4,8,12,16,20,24,28,32],
  padding:[0,4,8,12,16,20,24,28,32,36,40],
  fontSize:[11,12,13,14,15,16,17,18,20,22,24,26,28,30,32],
  gridGap:[0,4,8,12,16,20,24,28,32,36,40],
  minColumnWidth:[140,160,180,200,220,240,260,280,300,320,360,400]};
 const GRID='main :is(.grid,.form-grid,.filter-grid,.service-grid,.manager-grid,.service-buttons,.dossier-summary,.sheet-grid,.middle-cadre-columns,.staff-filters)';
 const CARDS='main :is(.card,.panel,.tile,.module,.surface,.dossier-pane,.config-block)';
 const BUTTONS='main button:not([class*="danger"]):not([class*="emergency"]):not([class*="status"]):not(.bpd-theme-toggle),main .button:not([class*="danger"])';
 const FIELDS='main input:not([type="checkbox"]):not([type="radio"]),main select,main textarea';
 const targetSelector=id=>{
  if(id==='page')return {box:'main',bg:'body'};
  if(id==='cards')return {box:CARDS};
  if(id==='buttons')return {box:BUTTONS};
  if(id==='headings')return {box:'main :is(h1,h2,h3)'};
  if(id==='fields')return {box:FIELDS};
  if(id==='grid')return {box:GRID};
  if(/^card-(?:[1-9]|[1-5]\d|60)$/.test(id))
   return {box:'main [data-bpd-design-card="'+id.slice(5)+'"]'};
  return null;
 };
 let sheet=null;
 function render(data){
  if(!sheet){sheet=document.createElement('style');sheet.id='bpdPageDesignStyles';document.head.append(sheet)}
  const rules=[];
  for(const entry of Array.isArray(data?.overrides)?data.overrides.slice(0,66):[]){
   const scope=targetSelector(entry?.target),values=entry?.values;
   if(!scope||!values||typeof values!=='object'||Array.isArray(values))continue;
   const sel=scope.box,base='html[data-bpd-design-page="'+file+'"] ';
   for(const theme of ['light','dark']){
    const prefix='html[data-bpd-design-page="'+file+'"][data-bpd-theme="'+theme+'"] ';
    const bg=values[theme+'Bg'],fg=values[theme+'Text'],border=values[theme+'Border'];
    if(typeof bg==='string'&&COLORS.test(bg)){
     rules.push(prefix+(scope.bg||sel)+'{background-color:'+bg+'!important}');
     if(!(typeof fg==='string'&&COLORS.test(fg))){
      const channel=[1,3,5].map(n=>parseInt(bg.slice(n,n+2),16)/255).map(v=>
       v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      const luminosity=.2126*channel[0]+.7152*channel[1]+.0722*channel[2];
      rules.push(prefix+sel+'{color:'+(luminosity>.179?'#111827':'#ffffff')+'!important}');
     }
    }
    if(typeof fg==='string'&&COLORS.test(fg))rules.push(prefix+sel+'{color:'+fg+'!important}');
    if(typeof border==='string'&&COLORS.test(border))
     rules.push(prefix+sel+'{border-color:'+border+'!important}');
   }
   const geometry=[];
   for(const [key,cssProp,suffix] of [
    ['radius','border-radius','px'],['padding','padding','px'],
    ['fontSize','font-size','px'],['gridGap','gap','px']
   ]){
    if(key==='gridGap'&&entry.target!=='grid')continue;
    if(NUMBERS[key].includes(values[key]))geometry.push(cssProp+':'+values[key]+suffix+'!important');
   }
   if(Object.hasOwn(FONTS,values.fontFamily))
    geometry.push('font-family:'+FONTS[values.fontFamily]+'!important');
   if(['normal','medium','bold'].includes(values.fontWeight))
    geometry.push('font-weight:'+({normal:400,medium:600,bold:700})[values.fontWeight]+'!important');
   if(['narrow','regular','wide','full'].includes(values.width)){
    const w={narrow:480,regular:760,wide:1180,full:null}[values.width];
    geometry.push('width:100%!important','max-width:'+(w===null?'none':w+'px')+'!important');
   }
   if(entry.target==='grid'){
    if(NUMBERS.minColumnWidth.includes(values.minColumnWidth))
     rules.push('html[data-bpd-design-page="'+file+'"]{--bpd-page-grid-min:'+values.minColumnWidth+'px}');
    if(['one','two','three','four'].includes(values.columns))
     geometry.push('grid-template-columns:repeat('+({one:1,two:2,three:3,four:4})[values.columns]+',minmax(0,1fr))!important');
   }
   if(geometry.length)rules.push(base+sel+'{'+geometry.join(';')+'}');
  }
  sheet.textContent=rules.join('\n');
  labelCards();
 }
 const selector='main :is(.card,.panel,.tile,.module,.surface,.dossier-pane,.config-block)';
 let observer=null,queued=false;
 function labelCards(){
  const main=document.querySelector('main');if(!main)return;
  const cards=[...main.querySelectorAll(':is(.card,.panel,.tile,.module,.surface,.dossier-pane,.config-block)')].slice(0,60);
  for(let index=0;index<cards.length;index++)
   cards[index].dataset.bpdDesignCard=String(index+1);
  if(new URLSearchParams(location.search).get('bpdDesignInspect')==='1')
   root.dataset.bpdDesignInspect='yes';
  if(observer)return;
  observer=new MutationObserver(()=>{
   if(queued)return;queued=true;
   queueMicrotask(()=>{queued=false;labelCards()});
  });
  observer.observe(main,{subtree:true,childList:true});
 }
 async function reload(){
  try{
   const response=await fetch('/api/visual-design/page/'+encodeURIComponent(file),{cache:'no-store'});
   if(!response.ok)throw Error('No page design');
   const data=await response.json();render(data);return data;
  }catch{render({overrides:[]});return {overrides:[],fallback:true}}
 }
 if(!document.getElementById('bpdResponsiveStyles')){
  const link=document.createElement('link');link.rel='stylesheet';
  link.id='bpdResponsiveStyles';link.href='/bpd-responsive-layout.css';document.head.append(link);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',labelCards,{once:true});
 else labelCards();
 window.BPDPageDesign={reload,preview:render,currentPage:file};
 void reload();
})();
