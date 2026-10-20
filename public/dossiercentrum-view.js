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
