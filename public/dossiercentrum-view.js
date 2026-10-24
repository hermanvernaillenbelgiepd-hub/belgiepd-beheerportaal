// Pure browser filters over already-authorized staff rows, no client-side grant logic.
export const DOSSIER_TYPES=Object.freeze(['all','personnel']);
export const APPLICATION_STATES=Object.freeze(['all']);
export const TIMELINE_TYPES=Object.freeze(['all','personeel','loopbaan']);
export const PAGE_SIZE=25;
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('nl-BE').trim().replace(/\s+/g,' ');
export function filterDossiers(rows,filters={}){
  const data=Array.isArray(rows)?rows:[];
  const query=normalized(filters.query);
  return data.filter(r=>r&&r.personnel===true&&
    (filters.department==='all'||!filters.department||r.dept===filters.department)&&
    (!query||[r.name,r.call,r.rank,r.status,r.discordId]
      .some(v=>normalized(v).includes(query))));
}
export const DOSSIER_SORT_OPTIONS=Object.freeze(['callsign-bpd','callsign-police','callsign-fire','callsign-desc','callsign-asc','name-asc','name-desc']);
// Compare numerical parts as numbers: e.g. 930 > 404 > 99, including mixed
// prefixes like SANTO-930 and SANTO-99. Unknown callsigns stay at the bottom.
const dossierCollator=new Intl.Collator('nl-BE',{numeric:true,sensitivity:'base'});
const compareFilled=(left,right,direction=1)=>{
  const a=String(left??'').trim(),b=String(right??'').trim();
  if(!a&&!b)return 0;
  if(!a)return 1;
  if(!b)return -1;
  return dossierCollator.compare(a,b)*direction;
};
// BelgiumPD order starts with the 900 series, ascending within each 100-range:
// 900, 910, 920 ... 990, then 800 ... down to the 0 series.
// 008 is explicitly the final callsign, including when prefixed (S008).
const bpdCallKey=value=>{
  const raw=String(value??'').trim();
  const match=raw.match(/(?:^|[^0-9])([0-9]{1,3})[*]?$/);
  if(!match)return {bucket:1,series:0,number:0};
  const number=Number(match[1]);
  if(match[1]==='008')return {bucket:2,series:0,number:8};
  return {bucket:0,series:Math.floor(number/100),number};
};
const bpdCallCompare=(left,right)=>{
  const a=bpdCallKey(left),b=bpdCallKey(right);
  return a.bucket-b.bucket||b.series-a.series||a.number-b.number||
    compareFilled(left,right);
};
// Police dossier display hierarchy. Numbers determine the series, while
// verified rank wording distinguishes 9xx Korpsleiding from Officierenkader.
// This is display-only; it never grants dossier permissions.
const POLICE_GROUP_LABELS=[
  'KORPSLEIDING',
  'OFFICIERENKADER',
  'MIDDENKADER',
  'BASISKADER',
  'AGENTENKADER',
  'OVERIGE POLITIE / BEHEER'
];
export function policeCallGroup(person){
  const call=String(person?.call||'').trim();
  const rank=String(person?.rank||'').trim().toLocaleLowerCase('nl-BE');
  const key=bpdCallKey(call);
  const callNumber=key.bucket===0?key.number:null;
  const isSpecial=key.bucket===2||callNumber!==null&&callNumber<100;
  let group=5;
  if(!isSpecial){
    if(callNumber!==null&&callNumber>=900&&callNumber<=999){
      const aspirant=rank.includes('aspirant commissaris')||rank.includes('(acp)');
      const chief=rank.includes('hoofdcommissaris')||
        rank.includes('eerste commissaris')||
        rank.includes('(1hcp)')||rank.includes('(1cp)');
      group=aspirant?1:chief||callNumber===900||callNumber===910?0:1;
    }else if(callNumber!==null&&callNumber>=600&&callNumber<=899)group=2;
    else if(callNumber!==null&&callNumber>=300&&callNumber<=599)group=3;
    else if(callNumber!==null&&callNumber>=100&&callNumber<=299)group=4;
    else if(rank.includes('hoofdcommissaris')||rank.includes('eerste commissaris'))group=0;
    else if(rank.includes('aspirant commissaris')||rank.includes('commissaris'))group=1;
    else if(rank.includes('hoofdinspecteur'))group=2;
    else if(rank.includes('inspecteur'))group=3;
    else if(rank.includes('agent'))group=4;
  }
  return {group,label:POLICE_GROUP_LABELS[group]};
}
const policeCallCompare=(a,b)=>{
  const left=policeCallGroup(a),right=policeCallGroup(b);
  return left.group-right.group||bpdCallCompare(a?.call,b?.call);
};
// Brandweer ordering follows operational Sheet sequence.
export function fireCallGroup(value){
 const v=String(value||'').trim().toUpperCase().replaceAll(' ','');
 let group=6,num=999;
 if(v==='ZONE'||v==='ZONECOMMANDANT'||v==='ZONECOMMANDANTE') {group=0;num=0;}
 else{
  const parts=v.split('-'),prefix=parts.length===2?parts[0]:v.replace(/[0-9]/g,''),
    n=Number(parts.length===2?parts[1]:v.slice(prefix.length));
  if(Number.isInteger(n)){
   if(prefix==='OFF'&&n>=2&&n<=6)group=1;
   if(prefix==='OOFF'&&n>=8&&n<=15)group=2;
   if((prefix==='BWM'||prefix==='BMW')&&n>=1&&n<=5)group=3;
   if((prefix==='BWM'||prefix==='BMW')&&n>=6&&n<=25)group=4;
   if(prefix==='STAG'&&n>=1&&n<=21)group=5;
   if(group!==6)num=n;
  }
 }
 const labels=['ZONECHEF · ZONECOMMANDANT(E)','HOGER KADER · OFF-02 t/m OFF-06',
 'MIDDENKADER · OOFF-08 t/m OOFF-15',
 'BASISKADER · Korporaal (BWM-01 t/m BWM-05)',
 'BASISKADER · Brandweerman/vrouw (BWM-06 t/m BWM-25)',
 'STAGIAIRS · STAG-01 t/m STAG-21','OVERIGE BRANDWEER'];
 return {group,number:num,label:labels[group]};
}
const fireCallCompare=(x,y)=>{
 const a=fireCallGroup(x),b=fireCallGroup(y);
 return a.group-b.group||a.number-b.number||compareFilled(x,y);
};
export function sortDossiers(rows,order='callsign-bpd'){
  const mode=DOSSIER_SORT_OPTIONS.includes(order)?order:'callsign-bpd';
  const byName=mode.startsWith('name-'),direction=mode.endsWith('-desc')?-1:1;
  return [...(Array.isArray(rows)?rows:[])].sort((a,b)=>{
    const main=mode==='callsign-police'?policeCallCompare(a,b):
      mode==='callsign-fire'?fireCallCompare(a?.call,b?.call):
      mode==='callsign-bpd'?bpdCallCompare(a?.call,b?.call):byName
      ?compareFilled(a?.name,b?.name,direction)
      :compareFilled(a?.call,b?.call,direction);
    if(main)return main;
    // Stable display order for equal names/callsigns, independent of input order.
    return compareFilled(a?.name,b?.name)
      ||compareFilled(a?.dept,b?.dept)
      ||compareFilled(a?.discordId,b?.discordId);
  });
}
export function dossierStats(rows){
  const data=Array.isArray(rows)?rows:[];
  const count=data.filter(row=>row?.personnel===true).length;
  return {total:count,personnel:count,applications:0,both:0};
}
export function paginateDossiers(rows,page=1,pageSize=PAGE_SIZE){
  const input=Array.isArray(rows)?rows:[];
  const size=Number.isSafeInteger(pageSize)?Math.min(Math.max(pageSize,1),100):PAGE_SIZE;
  const pages=Math.max(1,Math.ceil(input.length/size));
  const current=Number.isSafeInteger(page)?Math.min(Math.max(page,1),pages):1;
  return {page:current,pages,total:input.length,
    rows:input.slice((current-1)*size,current*size)};
}
export function filterTimeline(entries,kind='all'){
  const list=Array.isArray(entries)?entries:[];
  return TIMELINE_TYPES.includes(kind)&&kind!=='all'?
    list.filter(entry=>entry?.kind===kind):list;
}
