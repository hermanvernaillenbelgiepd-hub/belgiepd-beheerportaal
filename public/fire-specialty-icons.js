// Visual presentation of Brandweer specializations; no privileges or
// stored specialty values are altered by this module.
const SVG_NS='http://www.w3.org/2000/svg';
const icons=Object.freeze({
  ladder:[
    ['line',{x1:6,y1:22,x2:6,y2:2}],['line',{x1:18,y1:22,x2:18,y2:2}],
    ...[6,11,16].map(y=>['line',{x1:6,y1:y,x2:18,y2:y}])
  ],
  boxes:[
    ['rect',{x:7,y:2,width:10,height:9,rx:1}],['path',{d:'M12 2v9'}],
    ['rect',{x:2,y:13,width:9,height:9,rx:1}],['rect',{x:13,y:13,width:9,height:9,rx:1}]
  ],
  cone:[
    ['path',{d:'M12 2 5 19h14L12 2Z'}],['line',{x1:9,y1:11,x2:15,y2:11}],
    ['line',{x1:7,y1:16,x2:17,y2:16}],['line',{x1:3,y1:22,x2:21,y2:22}]
  ],
  waves:[
    ['path',{d:'M2 7c2.4 0 2.4 2 5 2s2.6-2 5-2 2.6 2 5 2 2.6-2 5-2'}],
    ['path',{d:'M2 13c2.4 0 2.4 2 5 2s2.6-2 5-2 2.6 2 5 2 2.6-2 5-2'}],
    ['path',{d:'M2 19c2.4 0 2.4 2 5 2s2.6-2 5-2 2.6 2 5 2 2.6-2 5-2'}]
  ],
  shield:[
    ['path',{d:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'}],
    ['path',{d:'m9 12 2 2 4-4'}]
  ],
  biohazard:[
    ['circle',{cx:12,cy:12,r:2}],['circle',{cx:12,cy:12,r:5.5}],
    ['path',{d:'M10 6A5 5 0 0 1 12 2a5 5 0 0 1 2 4'}],
    ['path',{d:'M6.5 11a5 5 0 0 0-3.6 1.7 5 5 0 0 0 2.6 4.8'}],
    ['path',{d:'M17.5 11a5 5 0 0 1 3.6 1.7 5 5 0 0 1-2.6 4.8'}]
  ],
  graduation:[
    ['path',{d:'m2 9 10-5 10 5-10 5-10-5Z'}],
    ['path',{d:'M6 11v5c2 3 10 3 12 0v-5'}],
    ['path',{d:'M22 9v7'}]
  ],
  other:[
    ['circle',{cx:12,cy:12,r:9}],['path',{d:'m8 12 2.5 2.5L16 9'}]
  ]
});
const known=Object.freeze({
  ladderwagen:{label:'Ladderwagen',icon:'ladder',emoji:'🪜'},
  logistiek:{label:'Logistiek',icon:'boxes',emoji:'📦'},
  signalisatie:{label:'Signalisatie',icon:'cone',emoji:'🚧'},
  duiker:{label:'Duiker',icon:'waves',emoji:'🌊'},
  redteam:{label:'RED-TEAM',icon:'shield',emoji:'🛡️'},
  gevaarlijkestoffen:{label:'Gevaarlijke stoffen',icon:'biohazard',emoji:'☣️'},
  basistraining:{label:'Basis training',icon:'graduation',emoji:'🎓'},
  basistr:{label:'Basis training',icon:'graduation',emoji:'🎓'},
  logistieksignalisatie:{label:'Logistiek / Signalisatie',icon:'boxes',emoji:'📦'}
});
export const fireSpecialtyKey=label=>String(label??'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function fireSpecialtyMeta(label){
  const raw=typeof label==='string'?label.trim():'';
  return known[fireSpecialtyKey(raw)]||{label:raw||'Specialisatie',icon:'other',emoji:'✅'};
}
export function fireSpecialtyStatusClass(value){
  const v=String(value??'').trim().toLocaleUpperCase('nl-BE');
  if(['JA','ACTIEF','GESLAAGD'].includes(v))return 'is-yes';
  if(['STAGE','AANGEMELD','IN OPLEIDING','IN_OPLEIDING'].includes(v))return 'is-stage';
  if(['DOCENT','INSTRUCTEUR'].includes(v))return 'is-docent';
  if(['RESTRICTED','OPLEIDING!','WAARSCHUWING'].includes(v))return 'is-warning';
  if(['GESCHORST','INACTIEF','BLACKLISTED'].includes(v))return 'is-off';
  return 'is-neutral';
}
function fireIcon(type){
  const svg=document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('width','18');
  svg.setAttribute('height','18');
  svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','1.8');
  svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');
  svg.setAttribute('aria-hidden','true');
  for(const [tag,attrs] of icons[type]||icons.other){
    const part=document.createElementNS(SVG_NS,tag);
    for(const [key,value] of Object.entries(attrs))part.setAttribute(key,String(value));
    svg.append(part);
  }
  return svg;
}
export function renderFireSpecialties(root,items,{compact=false,limit=0}={}){
  root.replaceChildren();
  const source=Array.isArray(items)?items.filter(i=>i&&typeof i==='object'):[];
  const visible=limit>0?source.slice(0,limit):source;
  if(!visible.length){
    const empty=document.createElement('span');
    empty.className='fire-specialty-empty';
    empty.textContent='Geen specialisaties beschikbaar';
    root.append(empty);return;
  }
  const list=document.createElement('div');
  list.className=compact?'fire-specialty-list is-compact':'fire-specialty-list';
  for(const item of visible){
    const meta=fireSpecialtyMeta(item.label);
    const row=document.createElement('div');
    row.className='fire-specialty-row';
    const left=document.createElement('span');
    left.className='fire-specialty-main';
    const icon=document.createElement('span');
    icon.className='fire-specialty-icon';
    icon.append(fireIcon(meta.icon));
    const name=document.createElement('span');
    name.className='fire-specialty-name';
    name.textContent=meta.label;
    left.append(icon,name);
    const status=document.createElement('span');
    status.className='fire-specialty-status '+fireSpecialtyStatusClass(item.value);
    status.textContent=String(item.value??'').trim()||'Niet ingevuld';
    row.append(left,status);list.append(row);
  }
  root.append(list);
}
