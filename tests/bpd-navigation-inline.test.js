import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../public/bpd-navigation.js',import.meta.url),'utf8');

class FakeElement {
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.attrs={};this.parent=null;
  this.className='';this.textContent='';this.href='';this.hidden=false;
  this.id='';this.handlers={};
  this.classList={
   add:cls=>{if(!this.className.split(' ').includes(cls))this.className=(this.className+' '+cls).trim();},
   remove:cls=>{this.className=this.className.split(' ').filter(x=>x!==cls).join(' ');},
   contains:cls=>this.className.split(' ').includes(cls),
   toggle:cls=>{const has=this.classList.contains(cls);this.classList[has?'remove':'add'](cls);return !has;}
  };
 }
 append(...children){for(const child of children){this.children.push(child);child.parent=this;}}
 prepend(...children){for(const child of [...children].reverse()){this.children.unshift(child);child.parent=this;}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 before(sibling){if(!this.parent)return;const i=this.parent.children.indexOf(this);this.parent.children.splice(i,0,sibling);sibling.parent=this.parent;}
 after(sibling){if(!this.parent)return;const i=this.parent.children.indexOf(this);this.parent.children.splice(i+1,0,sibling);sibling.parent=this.parent;}
 setAttribute(key,value){this.attrs[key]=value;}
 getAttribute(key){return this.attrs[key]??(key==='href'?this.href:null);}
 addEventListener(key,fn){this.handlers[key]=fn;}
 click(){this.handlers.click?.({target:this});}
 contains(child){for(let n=child;n;n=n.parent)if(n===this)return true;return false;}
 querySelector(selector){
  if(selector==='nav')return this.children.find(x=>x.tagName==='nav')||null;
  if(selector==='.header-actions'||selector==='.actions')return null;
  return null;
 }
 querySelectorAll(selector){
  const result=[];const match=node=>selector==='a[href]'&&node.tagName==='a'&&!!node.href;
  function walk(parent){for(const child of parent.children){if(match(child))result.push(child);walk(child);}}
  walk(this);return result;
 }
}
function traverse(root,pred){
 if(pred(root))return root;
 for(const child of root.children){const found=traverse(child,pred);if(found)return found;}
 return null;
}
function render(path,{header=true,initialStack=['/']}={}){
 let stored=JSON.stringify(initialStack),assigned=null;
 const body=new FakeElement('body'),menu=new FakeElement('nav'),
  topHeader=new FakeElement('header'),main=new FakeElement('main');
 if(header){topHeader.append(menu);body.append(topHeader);}
 body.append(main);
 const window={location:{pathname:path,href:'https://belgiepd.test'+path,
  origin:'https://belgiepd.test',assign(dest){assigned=dest;}},
  sessionStorage:{getItem(){return stored;},setItem(_,v){stored=v;}},
  history:{length:2,back(){}},self:null,top:null};
 window.self=window;window.top=window;
 const document={
  readyState:'complete',referrer:'',body,
  createElement:tag=>new FakeElement(tag),
  addEventListener(){},
  getElementById:id=>traverse(body,node=>node.id===id),
  querySelector(sel){
   if(sel==='body > header')return header?topHeader:null;
   if(sel==='body > main')return main;
   if(sel==='main')return main;
   return null;
  }
 };
 vm.runInNewContext(script,{window,document,URL});
 return {
  body,menu,main,header:topHeader,
  find:id=>traverse(body,n=>n.id===id),
  history:()=>JSON.parse(stored),
  assigned:()=>assigned
 };
}
test('Subpage gets the current sidebar and a compact Back button in its existing header',()=>{
 const page=render('/personeelsbeheer.html');
 assert.ok(page.find('bpdSidebar'));
 assert.ok(page.find('bpdMenuToggle'));
 const back=page.find('bpdGlobalNavigation');
 assert.ok(back);
 assert.equal(back.className,'bpd-inline-navigation');
 assert.equal(back.children.length,1);
 assert.equal(back.children[0].textContent,'← Terug');
 assert.equal(page.main.children.length,0,'No control should overlay main content');
 back.children[0].click();
 assert.equal(page.assigned(),'/');
});
test('Initial navigation contains only safe public links before server verification',()=>{
 const page=render('/rollen-opleidingen.html');
 const links=page.find('bpdSidebar').children[1].children;
 assert.deepEqual(links.map(x=>x.href),[
  '/','/personeelsbeheer.html','/organogram-hierarchie.html','/discord-status.html'
 ]);
 assert.ok(!links.some(x=>x.href==='/gebruikersbeheer.html#dienstbeheer'));
 assert.ok(!links.some(x=>x.href==='/dossiercentrum.html'));
});
test('Headerless subpage puts navigation before main content',()=>{
 const page=render('/some-page.html',{header:false});
 assert.ok(page.find('bpdSidebar'));
 assert.equal(page.body.children.indexOf(page.find('bpdQuicknav'))<
  page.body.children.indexOf(page.main),true);
 assert.ok(page.find('bpdMenuToggle'));
});
test('Homepage never duplicates the sidebar when no role-dependent homepage menu exists',()=>{
 const page=render('/');
 assert.equal(page.find('bpdSidebar'),null);
 assert.equal(page.find('bpdMenuToggle'),null);
});
test('Back navigation stores relative paths and never redirects through an external URL',()=>{
 assert.match(script,/function validPath\(path\)/);
 assert.match(script,/!path\.startsWith\('\/\/'\)/);
 assert.match(script,/!path\.includes\('\\\\'\)/);
 const page=render('/personeelsbeheer.html',{
  initialStack:['/','/gebruikersbeheer.html']
 });
 assert.deepEqual(page.history(),['/','/gebruikersbeheer.html','/personeelsbeheer.html']);
 page.find('bpdGlobalNavigation').children[0].click();
 assert.equal(page.assigned(),'/gebruikersbeheer.html');
});
