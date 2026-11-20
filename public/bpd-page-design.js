/* Page/frame design renderer. Only server-validated, fixed-value styling.
 * Nothing here confers access to protected personnel or management data. */
(function(){
 'use strict';
 const pathname=window.location.pathname;
 const match=/^\/([a-z0-9-]+)\.html$/.exec(pathname);
 const key=pathname==='/'?'index':match?.[1];
 if(!key||key==='vormgeving')return;
 const baseUrl='/api/visual-design/pages/'+encodeURIComponent(key);
 const fields={
  background:'color',textColor:'color',headingColor:'color',borderColor:'color',
  buttonBackground:'color',buttonText:'color',buttonBorder:'color',linkColor:'color',
  fontFamily:'font',fontSize:'fontSize',fontWeight:'weight',textAlign:'align',
  padding:'space',gap:'space',radius:'radius',borderWidth:'borderWidth',
  shadow:'shadow',maxWidth:'maxWidth',minHeight:'minHeight',
  buttonRadius:'radius',buttonFontSize:'fontSize',minColumnWidth:'columnWidth',
  columns:'columns'
 };
 const fonts={
  inter:'Inter,system-ui,Arial,sans-serif',system:'system-ui,Arial,sans-serif',
  arial:'Arial,Helvetica,sans-serif',verdana:'Verdana,Geneva,sans-serif',
  tahoma:'Tahoma,Arial,sans-serif',trebuchet:'"Trebuchet MS",Arial,sans-serif',
  georgia:'Georgia,serif',times:'"Times New Roman",serif',
  courier:'"Courier New",monospace'
 };
 const shadows={none:'none',subtle:'0 2px 9px rgba(0,0,0,.1)',
  medium:'0 7px 18px rgba(0,0,0,.17)',
  strong:'0 12px 28px rgba(0,0,0,.25)'};
 const validSlots=/^(?:page|block:(?:0|[1-9][0-9]{0,2})|id:[A-Za-z][A-Za-z0-9_-]{0,63})$/;
 const safeStyle=raw=>{
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const [k,v] of Object.entries(raw)){
   const type=fields[k];
   const valid=type==='color'?typeof v==='string'&&/^#[a-fA-F0-9]{6}$/.test(v):
    type==='font'?Object.hasOwn(fonts,v):
    type==='weight'?[400,500,600,700].includes(v):
    type==='align'?['left','center','right'].includes(v):
    type==='shadow'?Object.hasOwn(shadows,v):
    type==='columns'?['auto','1','2','3','4'].includes(v):
    Number.isSafeInteger(v)&&({
      fontSize:v>=10&&v<=26,space:v>=0&&v<=48,radius:v>=0&&v<=40,
      borderWidth:v>=0&&v<=5,maxWidth:v===0||(v>=280&&v<=1800),
      minHeight:v>=0&&v<=720,columnWidth:v>=160&&v<=500
    }[type]===true);
   if(valid)out[k]=v;
  }
  return out;
 };
 function safeStyles(raw){
  const out={};
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
   for(const [id,style] of Object.entries(raw).slice(0,120)){
    const pos=id.indexOf('|'),theme=id.slice(0,pos),slot=id.slice(pos+1);
    if(pos<0||!['both','light','dark'].includes(theme)||
      !validSlots.test(slot)||(slot.startsWith('block:')&&Number(slot.slice(6))>=120))
      continue;
    out[id]=safeStyle(style);
   }
  }
  return out;
 }
 let published={},previewState=null,frames=[],revision=0,scheduled=false;
 let sheet=null;
 const candidate='.card,.panel,.tile,.widget,.box,section,article,.sheet,.stat-card,.info-card,.dossier-block,.form-section,[data-bpd-design-frame]';
 function discover(){
  const root=document.querySelector('main')||document.querySelector('.surface')||document.body;
  if(!root)return [];
  root.setAttribute('data-bpd-page-frame','page');
  const picked=[{slot:'page',label:'Volledige pagina / hoofdinhoud',element:root}];
  const used=new Set(['page']);
  let number=0;
  for(const element of root.querySelectorAll(candidate)){
   if(picked.length>=120)break;
   if(element===root||element.closest('#bpdSidebar')||element.closest('.bpd-sidebar'))continue;
   const id=String(element.id||'');
   const uniqueId=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)?'id:'+id:null;
   const slot=uniqueId&&!used.has(uniqueId)?uniqueId:'block:'+number++;
   if(used.has(slot))continue;
   used.add(slot);
   element.setAttribute('data-bpd-page-frame',slot);
   const heading=element.querySelector('h2,h3,h4,summary');
   const label=heading?.textContent?.trim().replace(/\s+/g,' ').slice(0,65)||
     (id? id.replace(/[-_]/g,' ') : 'Kader '+picked.length);
   picked.push({slot,label,element});
  }
  frames=picked;
  return picked;
 }
 function cssFor(slot,theme,style){
  const selector='[data-bpd-page-frame="'+slot+'"]';
  const target=theme==='both'?selector:'html[data-bpd-theme="'+theme+'"] '+selector;
  const declaration=[];
  const add=(name,v)=>{if(v!==undefined)declaration.push(name+':'+v+' !important')};
  add('background-color',style.background);
  add('color',style.textColor);
  add('border-color',style.borderColor);
  if(style.borderWidth!==undefined)add('border-width',style.borderWidth+'px');
  if(style.radius!==undefined)add('border-radius',style.radius+'px');
  if(style.padding!==undefined)add('padding',style.padding+'px');
  if(style.gap!==undefined)add('gap',style.gap+'px');
  if(style.fontFamily)add('font-family',fonts[style.fontFamily]);
  if(style.fontSize!==undefined)add('font-size',style.fontSize+'px');
  if(style.fontWeight)add('font-weight',style.fontWeight);
  if(style.textAlign)add('text-align',style.textAlign);
  if(style.shadow)add('box-shadow',shadows[style.shadow]);
  if(style.maxWidth!==undefined)add('max-width',style.maxWidth===0?'none':style.maxWidth+'px');
  if(style.minHeight!==undefined)add('min-height',style.minHeight+'px');
  const lines=[];
  if(declaration.length)lines.push(target+'{'+declaration.join(';')+'}');
  if(style.headingColor)lines.push(target+' :is(h1,h2,h3,h4){color:'+style.headingColor+' !important}');
  if(style.linkColor)lines.push(target+' a:not(.pill):not(.badge){color:'+style.linkColor+' !important}');
  const button=target+' :is(button,input[type="submit"],input[type="button"],.button):not(.danger):not(.critical):not(.emergency):not([data-operational])';
  const b=[];
  // The real operational dispatch/TO board keeps its emergency/status palette.
  if(key!=='to-dienstbord'&&style.buttonBackground)
   b.push('background-color:'+style.buttonBackground+' !important');
  if(key!=='to-dienstbord'&&style.buttonText)b.push('color:'+style.buttonText+' !important');
  if(key!=='to-dienstbord'&&style.buttonBorder)b.push('border-color:'+style.buttonBorder+' !important');
  if(style.buttonRadius!==undefined)b.push('border-radius:'+style.buttonRadius+'px !important');
  if(style.buttonFontSize!==undefined)b.push('font-size:'+style.buttonFontSize+'px !important');
  if(b.length)lines.push(button+'{'+b.join(';')+'}');
  if(style.columns||style.minColumnWidth){
   const grids=target+' :is(.grid,.form-grid,.cards,.tiles,.card-grid,.tile-grid,.stats-grid,[data-bpd-responsive-grid])';
   const min=style.minColumnWidth||260;
   const value=style.columns&&style.columns!=='auto'?
    'repeat('+style.columns+',minmax(0,1fr))':
    'repeat(auto-fit,minmax(min(100%,'+min+'px),1fr))';
   lines.push(grids+'{display:grid;grid-template-columns:'+value+' !important;min-width:0}');
   lines.push('@media(max-width:900px){'+grids+
    '{grid-template-columns:repeat(auto-fit,minmax(min(100%,'+min+'px),1fr)) !important}}');
   lines.push('@media(max-width:620px){'+grids+
    '{grid-template-columns:minmax(0,1fr) !important}}');
  }
  return lines.join('\n');
 }
 function repaint(){
  discover();
  if(!sheet){sheet=document.createElement('style');sheet.id='bpdPageDesignStyles';document.head.append(sheet)}
  const all=previewState||published;
  // Both first, then light/dark overrides, regardless of object insertion order.
  sheet.textContent=Object.entries(all).sort((a,b)=>{
   const order={both:0,light:1,dark:2};
   return (order[a[0].split('|')[0]]??3)-(order[b[0].split('|')[0]]??3);
  }).map(([k,raw])=>{
   const sep=k.indexOf('|'),theme=k.slice(0,sep),slot=k.slice(sep+1);
   if(!validSlots.test(slot)||!['both','light','dark'].includes(theme))return '';
   return cssFor(slot,theme,safeStyle(raw));
  }).join('\n');
 }
 function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;repaint()});
 }
 async function reload(){
  try{
   const response=await fetch(baseUrl,{cache:'no-store'});
   if(!response.ok)throw Error('Page styles unavailable');
   const data=await response.json();
   published=safeStyles(data.styles);
   revision=Number.isSafeInteger(data.revision)?data.revision:0;
  }catch{published={};revision=0}
  previewState=null;
  schedule();
  return {styles:{...published},revision};
 }
 function preview({slot,theme='both',style={}}){
  if(!validSlots.test(slot)||!['both','light','dark'].includes(theme))return;
  previewState={...published};
  const key=theme+'|'+slot,clean=safeStyle(style);
  if(Object.keys(clean).length)previewState[key]=clean;
  else delete previewState[key];
  schedule();
 }
 function pick(slot){
  const frame=discover().find(x=>x.slot===slot);
  document.querySelectorAll('[data-bpd-editor-selected]').forEach(el=>el.removeAttribute('data-bpd-editor-selected'));
  if(frame){
   frame.element.setAttribute('data-bpd-editor-selected','');
   frame.element.scrollIntoView({behavior:'smooth',block:'center'});
  }
 }
 window.BPDPageDesign={getKey:()=>key,getFrames:()=>discover().map(({slot,label})=>({slot,label})),
  preview,restore:()=>{previewState=null;schedule()},pick,reload,
  getRevision:()=>revision};
 const editorStyle=document.createElement('style');
 editorStyle.textContent='[data-bpd-editor-selected]{outline:3px dashed #ef9b21 !important;outline-offset:2px !important}';
 document.head.append(editorStyle);
 const watcher=new MutationObserver(records=>{
  // Personnel and radio screens update labels frequently. Rebuild only
  // when a new section/card can actually affect the numbered frame catalog.
  const changed=records.some(row=>row.type==='childList'&&
   [...row.addedNodes].some(node=>node.nodeType===1&&
    (node.matches?.(candidate)||node.querySelector?.(candidate))));
  if(changed)schedule();
 });
 function start(){
  if(!document.body)return;
  document.documentElement.setAttribute('data-bpd-page-design',key);
  if(!document.getElementById('bpdResponsiveGridSheet')){
   const responsive=document.createElement('link');
   responsive.rel='stylesheet';responsive.href='/bpd-page-responsive.css';
   responsive.id='bpdResponsiveGridSheet';document.head.append(responsive);
  }
  discover();
  watcher.observe(document.body,{childList:true,subtree:true});
  void reload();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
