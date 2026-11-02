import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync(new URL('../public/assets/organogram-decorations.js',import.meta.url),'utf8');
const coat=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
const profile=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');

class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};
  this.style={};this.attributes={};this.textContent='';}
 append(...items){this.children.push(...items)}
 setAttribute(key,value){this.attributes[key]=value}
}
const window={};
runInNewContext(js,{window,document:{createElement:tag=>new Element(tag)}});

test('medals render only beneath the rank, not duplicated as top ribbons',()=>{
 const medal={id:'ereteken_zilver',kind:'medal',color:'silver',label:'Zilveren erekruis',priority:1};
 const ribbon={id:'lint_blauw_goud',kind:'ribbon',color:'blue-gold',label:'Dienstlint',priority:2};
 const badge={id:'pen_zilver',kind:'badge',color:'silver',label:'Ereteken',priority:3};
 const rack=window.BPDDecorations.uniformRack([medal,ribbon,badge]);
 assert.equal(rack.medals.children.length,1);
 assert.equal(rack.ribbons.children.length,2);
 const onlyMedal=window.BPDDecorations.uniformRack([medal]);
 assert.equal(onlyMedal.ribbons,null);
 assert.equal(onlyMedal.medals.children.length,1);
 assert.equal(window.BPDDecorations.uniformRack([]),null);
});

test('profile loads decoration stylesheet alongside its JavaScript renderer',()=>{
 assert.ok(profile.includes('href="/assets/organogram-decorations.css?v=awards-position-20261102"'));
 assert.ok(profile.includes('src="/assets/organogram-decorations.js?v=awards-position-20261102"'));
});

test('both gold and silver medals are inside the coat stage with portrait anchors',()=>{
 assert.match(coat,/applyCompositePlace\(rack\.ribbons,person,'ribbons'\);stage\.append\(rack\.ribbons\)/);
 assert.match(coat,/applyCompositePlace\(rack\.medals,person,'medals'\);stage\.append\(rack\.medals\)/);
 for(const variant of ['gold','silver']){
  assert.ok(css.includes('.bpd-'+variant+'-stage>.bpd-uniform-ribbons'));
  assert.ok(css.includes('.bpd-'+variant+'-stage>.bpd-uniform-medals'));
 }
 assert.match(css,/\.bpd-assigned-coat>\.bpd-gold-stage>\.bpd-uniform-ribbons/);
 assert.match(css,/left:55\.3%;top:26%;width:19%;height:5%/);
 assert.match(css,/left:55\.3%;top:45%;width:23%;height:18%/);
 assert.match(coat,/visualLayout\?\.\[kind\]/);
});
