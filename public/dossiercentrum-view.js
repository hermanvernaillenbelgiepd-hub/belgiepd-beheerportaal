// Browser and Node share these read-only filters. Access is always checked
// server-side; changing these filters never expands the authorised dataset.
export const DOSSIER_TYPES=Object.freeze(['all','personnel','application','both']);
export const APPLICATION_STATES=Object.freeze(['all','submitted','reviewing','accepted','rejected']);
export const TIMELINE_TYPES=Object.freeze(['all','personeel','loopbaan','sollicitatie','burger']);
export const PAGE_SIZE=25;
function normalized(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('nl-BE').trim().replace(/\s+/g,' ');
}
export function filterDossiers(rows,filters={}){
  const input=Array.isArray(rows)?rows:[];
  const dept=String(filters.department||'all');
  const kind=DOSSIER_TYPES.includes(filters.kind)?filters.kind:'all';
  const applicationStatus=APPLICATION_STATES.includes(filters.applicationStatus)
    ?filters.applicationStatus:'all';
  const query=normalized(filters.query);
  return input.filter(row=>{
    if(!row||typeof row!=='object')return false;
    if(dept!=='all'&&row.dept!==dept)return false;
    if(kind==='personnel'&&!row.personnel)return false;
    if(kind==='application'&&!row.application)return false;
    if(kind==='both'&&!(row.personnel&&row.application))return false;
    if(applicationStatus!=='all'&&
       (!row.application||row.applicationStatus!==applicationStatus))return false;
    return !query||[row.name,row.call,row.rank,row.status,row.discordId,row.applicationStatus]
      .some(value=>normalized(value).includes(query));
  });
}
export function dossierStats(rows){
  const input=Array.isArray(rows)?rows:[];
  return {total:input.length,personnel:input.filter(r=>r?.personnel).length,
    applications:input.filter(r=>r?.application).length,
    both:input.filter(r=>r?.personnel&&r?.application).length};
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
