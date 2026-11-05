import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const file=readFileSync(new URL('../public/assets/bpd-nameplate-autofit.js',import.meta.url),'utf8');
function load(){
 const context={font:'10px Arial',measureText(value){
  const fontSize=Number.parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||'10');
  // Approximate actual Arial glyph widths, with wide/narrow differences.
  return {width:[...String(value)].reduce((sum,ch)=>
   sum+fontSize*(/[MW@]/i.test(ch)?.88:/[iIl1. ,:-]/.test(ch)?.29:.57),0)};
 }};
 const document={createElement:()=>({getContext:()=>context}),fonts:{ready:Promise.resolve()}};
 const window={getComputedStyle:row=>({
  fontSize:row.style.fontSize||'10px',fontStyle:'normal',fontWeight:'800',
  fontFamily:'Arial',letterSpacing:'0px'}),
  requestAnimationFrame:cb=>cb(),
  ResizeObserver:class{constructor(cb){this.callback=cb;}observe(node){this.node=node;}}};
 runInNewContext(file,{document,window});
 const makeRow=(text,width,height=10)=>({
  textContent:text,clientWidth:width,clientHeight:height,style:{fontSize:''}});
 const makePlate=rows=>({isConnected:true,querySelectorAll:()=>rows});
 return {api:window.BPDNameplateFit,makeRow,makePlate,context};
}
test('short names keep their full CSS font size',()=>{
 const {api,makeRow,makePlate}=load();
 const name=makeRow('THIJS',54),call=makeRow('BELGIEPD - 900',54);
 api.fit(makePlate([name,call]));
 assert.equal(name.style.fontSize,'9.00px'); // height-safe 90% with 10px line box
 assert.ok(Number.parseFloat(call.style.fontSize)<=9);
});
test('long full names and BELGIEPD-CALL shrink separately instead of being clipped',()=>{
 const {api,makeRow,makePlate,context}=load();
 const name=makeRow('CANDER_DIETER_VANDEVELDE',37,12);
 const call=makeRow('BELGIEPD - 516',37,12);
 const plate=makePlate([name,call]);
 api.watch(plate);
 const nameSize=Number.parseFloat(name.style.fontSize);
 const callSize=Number.parseFloat(call.style.fontSize);
 assert.ok(nameSize<callSize,'the longer name must fit at a smaller size');
 for(const row of [name,call]){
  const size=Number.parseFloat(row.style.fontSize);
  context.font='normal 800 '+size+'px Arial';
  assert.ok(context.measureText(row.textContent).width<=row.clientWidth,
   row.textContent+' must remain fully visible');
  assert.equal(row.style.textOverflow,'clip');
 }
});
test('resizing a nameplate can grow fonts again without stale inline sizing',()=>{
 const {api,makeRow,makePlate}=load();
 const name=makeRow('DE LANGERE ACHTERNAAM',28,12);
 const plate=makePlate([name]);
 api.fit(plate);
 const small=Number.parseFloat(name.style.fontSize);
 name.clientWidth=100;
 api.fit(plate);
 assert.ok(Number.parseFloat(name.style.fontSize)>small);
});
test('the same single autofit script is loaded before live and atelier renderers',()=>{
 for(const page of ['organogram.html','organogram-hierarchie.html','gebruikersbeheer.html']){
  const html=readFileSync(new URL('../public/'+page,import.meta.url),'utf8');
  const fit=html.indexOf('/assets/bpd-nameplate-autofit.js?v=name-autofit-20261031-v5');
  const renderer=html.indexOf(page==='gebruikersbeheer.html'?'uniform-composer-ui.js?v=award-chest-20261104':
   (page==='organogram-hierarchie.html'?'/assets/organogram-police-formal.js?v=awards-chest-20261104':
    '/assets/organogram-police-formal.js?v=name-autofit-20261031-v5'));
  assert.ok(fit>=0&&fit<renderer,page+' must load fit before its renderer');
 }
 const code=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../public/uniform-composer-ui.js',import.meta.url),'utf8');
 assert.match(code,/BPDNameplateFit\?\.watch\(plate\)/);
 assert.match(studio,/BPDNameplateFit\?\.watch\(plate\)/);
});
