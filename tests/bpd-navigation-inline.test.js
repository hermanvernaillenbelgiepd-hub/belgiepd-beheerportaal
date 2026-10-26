import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../public/bpd-navigation.js',import.meta.url),'utf8');
const stylesheet=readFileSync(new URL('../public/bpd-navigation.css',import.meta.url),'utf8');
function element(tag){
  return {tagName:tag,children:[],attrs:{},href:'',textContent:'',
    setAttribute(k,v){this.attrs[k]=v;},
    getAttribute(k){return this[k]||null;},
    append(...elements){this.children.push(...elements);},
    prepend(node){this.children.unshift(node);},
    addEventListener(event,fn){this[event]=fn;},
    querySelectorAll(){return [];}};
}
function render(path,{header=true,home=true,initialStack=['/']}={}){
  let stored=JSON.stringify(initialStack),assigned=null,backCalls=0;
  const menu=element('nav'),main=element('main'),body=element('body');
  const link=element('a');link.href='/';
  menu.querySelectorAll=()=>home?[link]:[];
  const window={location:{pathname:path,href:'https://belgiepd.test'+path,
      origin:'https://belgiepd.test',assign(target){assigned=target;}},
    sessionStorage:{getItem(){return stored;},setItem(_,v){stored=v;}},
    history:{length:3,back(){backCalls++;}},self:null,top:null};
  window.self=window;window.top=window;
  const document={readyState:'complete',referrer:'',body,
    getElementById(){return null;},createElement:element,
    querySelector(s){return s==='header nav'?(header?menu:null):
      s==='main'?main:null;}};
  vm.runInNewContext(script,{window,document,URL});
  const container=header?menu:main;
  return {bar:container.children[0],main,menu,body,
    history(){return JSON.parse(stored);},assigned(){return assigned;},backCalls(){return backCalls;}};
}
test('Roster has only a small Back control in the existing header; Dashboard remains Home',()=>{
  const page=render('/personeelsbeheer.html');
  assert.equal(page.bar.id,'bpdGlobalNavigation');
  assert.equal(page.bar.className,'bpd-inline-navigation');
  assert.equal(page.bar.children.length,1);
  assert.equal(page.bar.children[0].textContent,'← Terug');
  assert.equal(page.body.children.length,0,'No bar may overlay the lower-right table');
  page.bar.children[0].click();
  assert.equal(page.assigned(),'/');
});
test('Header without Dashboard receives one compact Start link next to Back',()=>{
  const page=render('/rollen-opleidingen.html',{home:false});
  assert.deepEqual(page.bar.children.map(x=>x.textContent),['← Terug','⌂ Start']);
  assert.equal(page.bar.children[1].href,'/');
});
test('Headerless pages get navigation before content, never at bottom of body',()=>{
  const page=render('/some-page.html',{header:false,home:false});
  assert.equal(page.main.children[0].id,'bpdGlobalNavigation');
  assert.equal(page.body.children.length,0);
});
test('Dashboard already contains its own navigation and gets no extra panel',()=>{
  const page=render('/');
  assert.equal(page.menu.children.length,0);
  assert.equal(page.body.children.length,0);
});
test('History stores only relative paths and stylesheet contains no fixed navigation',()=>{
  assert.doesNotMatch(script,/document\.body\.append\(bar\)/);
  assert.doesNotMatch(stylesheet,/position\s*:\s*fixed/);
  const page=render('/personeelsbeheer.html',{initialStack:['/','/gebruikersbeheer.html']});
  assert.deepEqual(page.history(),['/','/gebruikersbeheer.html','/personeelsbeheer.html']);
  page.bar.children[0].click();
  assert.equal(page.assigned(),'/gebruikersbeheer.html');
});
