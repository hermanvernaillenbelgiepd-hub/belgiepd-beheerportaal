import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const client=readFileSync(new URL('../public/assets/organogram-decorations.js',import.meta.url),'utf8');
const routes=readFileSync(new URL('../src/personnel-decoration-routes.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/organogram-decorations.css',import.meta.url),'utf8');
const hierarchy=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const organogram=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.textContent='';}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=[...items]}
 setAttribute(key,value){this.attributes[key]=value}
 addEventListener(kind,callback){this.listeners[kind]=callback}
}
const window={};
runInNewContext(client,{window,document:{createElement:tag=>new Element(tag)}});
function picker(items,selected){
 const values=new Map(items.map(x=>[x.id,x]));
 const select=new Element('select');select.value=selected;
 const preview=window.BPDDecorations.decorationPreview(select,id=>values.get(id));
 return {values,select,preview,art:()=>preview.element.children[0].children[0],
  title:()=>preview.element.children[1]?.children[0]?.textContent};
}

test('toekenning toont de correcte vorm en naam bij wisselende selectie',()=>{
 const medal={id:'ereteken_zilver',kind:'medal',color:'silver',label:'Zilveren erekruis'};
 const ribbon={id:'lint_blauw_goud',kind:'ribbon',color:'blue-gold',label:'Dienstlint'};
 const p=picker([medal,ribbon],medal.id);
 assert.equal(p.preview.element.attributes['aria-live'],'polite');
 assert.equal(p.title(),medal.label);
 assert.equal(p.art().dataset.medal,'ereteken_zilver');
 p.select.value=ribbon.id;p.select.listeners.change();
 assert.equal(p.title(),ribbon.label);
 assert.equal(p.art().className,'bpd-ribbon');
 assert.equal(p.art().dataset.color,'blue-gold');
});

test('naamswijziging kan het visuele voorbeeld vernieuwen zonder catalogus-ID te wijzigen',()=>{
 const medal={id:'dienstmedaille_goud',kind:'medal',color:'gold',label:'Gouden dienstmedaille'};
 const p=picker([medal],medal.id);
 p.values.set(medal.id,{...medal,label:'Medaille voor verdienste'});
 p.preview.render();
 assert.equal(p.title(),'Medaille voor verdienste');
 assert.equal(p.art().dataset.medal,medal.id);
});

test('upload toont Firestore-afbeelding in het voorbeeld, nooit een willekeurige URL',()=>{
 const id='custom_12345678-1234-4234-8234-123456789abc';
 const custom={id,kind:'medal',color:'gold',label:'Nieuwe onderscheiding',
  imageUrl:'/api/personnel-awards/catalog-image/'+id};
 const p=picker([custom],id);
 assert.equal(p.art().children[0].src,custom.imageUrl);
 const invalid=picker([{...custom,imageUrl:'https://example.com/redirect'}],id);
 assert.equal(invalid.art().children.length,2);
});

test('beide selecties gebruiken preview en naamswijziging ontvangt afbeeldingsmetadata',()=>{
 assert.match(client,/panel\.append\(node\('label','','Onderscheiding'\),catalogue,awardPreview\.element\)/);
 assert.match(client,/renamePreview\.element,node\('label','','Nieuwe naam'\)/);
 assert.match(client,/renamePreview\.render\(\)/);
 assert.match(client,/awardPreview\.render\(\)/);
 assert.match(routes,/id:item\.id,label:item\.label,kind:item\.kind,color:item\.color,/);
 assert.match(routes,/imageUrl:item\.imageUrl\|\|null/);
 assert.match(routes,/if\(!canRenameDecorationCatalog\(req\.bpd\)\)/);
 assert.match(css,/\.bpd-catalog-preview-art \.bpd-medal-art/);
 for(const html of [hierarchy,organogram]){
  assert.match(html,/organogram-decorations\.js\?v=award-preview-20261104/);
  assert.match(html,/organogram-decorations\.css\?v=award-preview-20261104/);
 }
});
