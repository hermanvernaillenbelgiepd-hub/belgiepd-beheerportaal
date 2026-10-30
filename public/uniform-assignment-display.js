// Client-side visual-only resolver. Scoped assignments never confer rank or roles.
import {getTier} from '/assets/organogram-hierarchie-model.js';
const UID=/^\d{15,22}$/;
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const nameCode=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
let rules=[],assetUrls=new Map();
function setData(assignments,artworks){
 rules=(Array.isArray(assignments)?assignments:[]).filter(x=>
  x&&['politie','brandweer','ambulance','depannage','burger'].includes(x.department)&&
  ['service','cadre','rank','person'].includes(x.scope)&&
  (CODE.test(x.selector||'')||UID.test(x.selector||'')));
 assetUrls=new Map();
 for(const row of Array.isArray(artworks)?artworks:[]){
  const key=String(row?.key||''),url=String(row?.imageUrl||'');
  if(!/^(?:uniform|specialty)_(?:politie|brandweer|ambulance|depannage|burger)_[a-z0-9][a-z0-9_]{0,39}$/.test(key)||
   !/^\/api\/role-artwork\/file\/(?:uniform|specialty)_(?:politie|brandweer|ambulance|depannage|burger)_[a-z0-9][a-z0-9_]{0,39}\?v=[a-zA-Z0-9-]+$/.test(url))
   continue;
  assetUrls.set(key,url);
 }
}
function forPerson(p){
 const dept=String(p?.dept||'');
 const id=UID.test(String(p.personId||''))?String(p.personId):'';
 const matching=(scope,selector)=>rules.find(r=>r.department===dept&&r.scope===scope&&r.selector===selector);
 const ordered=[...(id?[matching('person',id)]:[]),
  matching('rank',nameCode(p.rank)),matching('cadre',nameCode(getTier(p))),
  matching('service','default')];
 let uniformCode='',badgeStyle='';
 for(const entry of ordered){
  if(!entry)continue;
  if(!uniformCode&&CODE.test(entry.uniformCode||'')&&
   assetUrls.has('uniform_'+dept+'_'+entry.uniformCode))uniformCode=entry.uniformCode;
  if(!badgeStyle&&['lokaal','federaal'].includes(entry.badgeStyle))badgeStyle=entry.badgeStyle;
 }
 return {uniformCode,badgeStyle,uniformUrl:uniformCode?
  assetUrls.get('uniform_'+dept+'_'+uniformCode)||'':''};
}
function specialtyImage(p,name,variant=''){
 const info=forPerson(p);
 if(!info.badgeStyle)return '';
 const dept=String(p?.dept||''),base=nameCode(name);
 const specific=variant?nameCode(base+'_'+variant):'';
 const choices=[
  ...(specific?['specialty_'+dept+'_'+specific+'_'+info.badgeStyle]:[]),
  'specialty_'+dept+'_'+base+'_'+info.badgeStyle
 ];
 return choices.map(k=>assetUrls.get(k)).find(Boolean)||'';
}
window.BPDUniformAssignments=Object.freeze({setData,forPerson,specialtyImage});
