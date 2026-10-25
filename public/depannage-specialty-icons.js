// BelgiumPD Depannage: display mapping only. An icon or label never conveys
// a qualification, Discord role, or permission to operate equipment.
const SVG_NS='http://www.w3.org/2000/svg';
const defs=Object.freeze({
  tow:[
    ['rect',{x:2,y:12,width:12,height:6,rx:1}],['path',{d:'M14 15h3l3-4h2v7h-8'}],
    ['circle',{cx:7,cy:19,r:2}],['circle',{cx:19,cy:19,r:2}],
    ['path',{d:'M6 12V6h8m-2-3h4v6'}]
  ],
  fast:[
    ['path',{d:'M3 20 8 4h8l5 16'}],
    ['path',{d:'M12 4v4m0 4v4m0 3v1'}],
    ['path',{d:'M4 20h16'}]
  ],
  crane:[
    ['path',{d:'M4 22V5h3v17M2 5h20l-3-3'}],
    ['path',{d:'M7 8h14M11 8v4m8-4v4'}],
    ['path',{d:'M19 12v5m-2 0h4m-2 0v2'}],
    ['path',{d:'M2 22h8'}]
  ],
  road:[
    ['path',{d:'M12 2 5 19h14L12 2Z'}],
    ['path',{d:'M9 11h6M7 16h10M3 22h18'}]
  ]
});
const canonical=Object.freeze([
 {key:'depannage',label:'Depannage',source:'Opleiding DEP2K',icon:'tow'},
 {key:'fast',label:'FAST',source:'Opleiding FAST',icon:'fast'},
 {key:'crane',label:'CRANE',source:'CRANE',icon:'crane'},
 {key:'wegenwerken',label:'Wegenwerken',source:'WEGENWERKEN',icon:'road'}
]);
export const depannageSpecialtyDefinitions=canonical;
const key=value=>String(value??'').toLocaleLowerCase('nl-BE')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function depannageSpecialtyMeta(name){
 const k=key(name);
 const known=canonical.find(x=>key(x.source)===k||key(x.label)===k);
 return known||{key:k,label:String(name||'Specialisatie'),source:String(name||''),icon:'tow'};
}
export function depannageSpecialtyRows(source){
 const list=Array.isArray(source)?source:[];
 const normalized=new Map();
 for(const row of list){
   if(!row||typeof row!=='object')continue;
   const meta=depannageSpecialtyMeta(row.label);
   if(!canonical.some(x=>x.key===meta.key))continue;
   // Real service data is passed in with either value (Firestore) or
   // status (personnel visuals). Never assume that an empty field means JA.
   const status=typeof row.value==='string'?row.value:
     typeof row.status==='string'?row.status:'Niet ingevuld';
   if(!normalized.has(meta.key))normalized.set(meta.key,{...meta,value:status});
 }
 return canonical.map(item=>normalized.get(item.key)||
   {...item,value:'Niet ingevuld'});
}
export function depannageStatusClass(raw){
 const status=String(raw||'').trim().toLocaleUpperCase('nl-BE');
 if(['JA','GESLAAGD','ACTIEF'].includes(status))return 'is-yes';
 if(['STAGE','IN OPLEIDING','AANGEMELD'].includes(status))return 'is-stage';
 if(['DOCENT','INSTRUCTEUR'].includes(status))return 'is-docent';
 if(['RESTRICTED','OPLEIDING!'].includes(status))return 'is-warning';
 if(['GESCHORST','INACTIEF'].includes(status))return 'is-off';
 return 'is-neutral';
}
function svgIcon(kind){
 const svg=document.createElementNS(SVG_NS,'svg');
 for(const [name,value] of Object.entries({
   viewBox:'0 0 24 24',width:'18',height:'18',fill:'none',
   stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round',
   'stroke-linejoin':'round','aria-hidden':'true'
 }))svg.setAttribute(name,value);
 for(const [tag,attrs] of defs[kind]||defs.tow){
   const shape=document.createElementNS(SVG_NS,tag);
   for(const [name,val] of Object.entries(attrs))
     shape.setAttribute(name,String(val));
   svg.append(shape);
 }
 return svg;
}
export function renderDepannageSpecialties(root,source,{compact=false}={}){
 const rows=depannageSpecialtyRows(source);
 root.replaceChildren();
 const list=document.createElement('div');
 list.className='depannage-specialty-list'+(compact?' is-compact':'');
 for(const item of rows){
   const cell=document.createElement('div');cell.className='depannage-specialty-row';
   const main=document.createElement('span');main.className='depannage-specialty-main';
   const icon=document.createElement('span');icon.className='depannage-specialty-icon';
   icon.append(svgIcon(item.icon));
   const title=document.createElement('span');title.className='depannage-specialty-name';
   title.textContent=item.label;
   main.append(icon,title);
   const badge=document.createElement('span');
   badge.className='depannage-specialty-status '+depannageStatusClass(item.value);
   badge.textContent=String(item.value||'Niet ingevuld');
   cell.append(main,badge);list.append(cell);
 }
 root.append(list);
}
