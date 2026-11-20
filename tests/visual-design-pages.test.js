import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 DESIGN_PAGE_CATALOG,DESIGN_PAGE_FIELDS,validDesignPageKey,validDesignSlot,
 validateDesignPageStyle,validatedDesignPageWrite,pageDesignStylesFrom,pageDesignSlotKey
} from '../src/visual-design-page-policy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('every portal page is individually available with safe names',()=>{
 const pages=new Set(DESIGN_PAGE_CATALOG.map(x=>x.key));
 assert.equal(pages.size,DESIGN_PAGE_CATALOG.length);
 for(const key of ['index','personeelsbeheer','dossiercentrum','brandweerdossier',
  'burger-personeelsdossiers','activiteitscentrum','opleidingscentrum','meldingen',
  'to-dienstbord','beheercentrum','vormgeving'])
  assert.ok(validDesignPageKey(key),'missing page: '+key);
 assert.equal(validDesignPageKey('../private'),false);
 assert.equal(validDesignPageKey('unknown'),false);
 assert.equal(DESIGN_PAGE_CATALOG.length>=35,true);
});
test('frame selection accepts named IDs and stable indexed slots, never selectors',()=>{
 for(const id of ['page','id:staffSummary','id:section_foo','block:0','block:119'])
  assert.ok(validDesignSlot(id),id);
 for(const id of ['block:120','block:-1','id:bad] div','id:123abc',
  'page>body','id:card;display:none','constructor','',null])
  assert.equal(validDesignSlot(id),false,id);
});
test('page and panel color, size, shape, font, buttons and columns have safe bounded values',()=>{
 const style={background:'#aabbcc',textColor:'#112233',headingColor:'#123abc',
  borderColor:'#dedede',buttonBackground:'#002244',buttonText:'#ffffff',
  buttonBorder:'#123456',linkColor:'#345678',fontFamily:'georgia',
  fontSize:16,fontWeight:600,textAlign:'center',padding:28,gap:12,
  radius:18,borderWidth:2,shadow:'medium',maxWidth:1080,minHeight:150,
  buttonRadius:22,buttonFontSize:14,minColumnWidth:310,columns:'auto'};
 assert.equal(Object.keys(DESIGN_PAGE_FIELDS).length,23);
 assert.deepEqual(validateDesignPageStyle(style),style);
 for(const entry of [
  {background:'red; color: red'},{background:'url(http://example.org/x)'},
  {textColor:'var(--secret)'},{buttonBackground:'expression(1)'},
  {fontFamily:'url(https://example.org/font)'},{fontWeight:999},
  {padding:-1},{radius:100},{maxWidth:200},{columns:'repeat(100,1fr)'},
  {minColumnWidth:10},{invalidProp:'x'}
 ])assert.throws(()=>validateDesignPageStyle(entry));
});
test('publisher validates motivation, theme and revision before a change',()=>{
 const data={slot:'id:staffSummary',theme:'dark',
  style:{buttonBackground:'#315fc2',radius:12,columns:'2'},
  expectedRevision:4,reason:'Beter contrast voor gebruikers'};
 assert.deepEqual(validatedDesignPageWrite(data),data);
 for(const variant of [{reason:'kort'},{expectedRevision:-1},
  {theme:'javascript:alert(1)'},{slot:'id:foo.bar'},
  {style:{background:'<script>'}},{admin:true}])
  assert.throws(()=>validatedDesignPageWrite({...data,...variant}));
 assert.deepEqual(validatedDesignPageWrite({...data,style:{}}).style,{});
});
test('public style projection skips untrusted records without CSS injection',()=>{
 const k=pageDesignSlotKey('id:staffSummary','dark');
 const r=pageDesignStylesFrom({
  [k]:{background:'#aabbcc',fontFamily:'tahoma'},
  'both|block:5':{padding:10},
  'both|id:danger}body':{background:'#ffffff'},
  'both|block:200':{background:'#ffffff'},
  'light|page':{fontFamily:'url(http://x)'}
 });
 assert.deepEqual(r[k],{background:'#aabbcc',fontFamily:'tahoma'});
 assert.deepEqual(r['both|block:5'],{padding:10});
 assert.equal(Object.hasOwn(r,'both|id:danger}body'),false);
 assert.equal(Object.hasOwn(r,'both|block:200'),false);
 assert.equal(Object.hasOwn(r,'light|page'),false);
});
test('all page editing endpoints are protected and have transaction/audit',()=>{
 const routes=read('src/visual-design-page-routes.js');
 const server=read('src/server.js');
 assert.match(routes,/app\.get\('\/api\/visual-design\/pages\/catalog',requireUser/);
 assert.match(routes,/app\.get\('\/api\/visual-design\/pages\/:key',async/);
 assert.match(routes,/app\.put\('\/api\/visual-design\/pages\/:key',requireUser/);
 assert.match(routes,/if\(!await canEditVisualDesign\(dbFactory\(\),req\.bpd\)\)/);
 assert.match(routes,/validatedDesignPageWrite\(req\.body\)/);
 assert.match(routes,/db\.runTransaction\(async tx=>/);
 assert.match(routes,/tx\.create\(audit,/);
 assert.match(server,/installVisualDesignPageRoutes\(app,\{requireUser\}\)/);
});
test('page UI has responsive previews, frame targeting, safe controls and separate rights',()=>{
 const html=read('public/vormgeving.html');
 const editor=read('public/visual-design-workspace.js');
 const renderer=read('public/bpd-page-design.js');
 const responsive=read('public/bpd-page-responsive.css');
 const nav=read('public/bpd-navigation.js');
 const center=read('public/beheercentrum.html');
 for(const id of ['pageSelect','slotSelect','pageTheme','propertyFields','pageFrame',
  'savePage','rightsTab','rightsHint','visualDesignForm','visualDesign']) 
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(editor,/setupVisualDesignGrantsEditor/);
 assert.match(editor,/data\.canDelegate/);
 assert.match(editor,/onAuthStateChanged/);
 assert.match(editor,/expectedRevision:pageRevision/);
 assert.match(renderer,/safeStyle/);
 assert.match(renderer,/data-bpd-page-frame/);
 assert.match(renderer,/MutationObserver/);
 assert.match(responsive,/repeat\(auto-fit,minmax\(min\(100%,260px\),1fr\)\)/);
 assert.match(nav,/pageStyle\.src='\/bpd-page-design\.js'/);
 assert.match(center,/href="\/vormgeving\.html"/);
});
