// Read-only effective state of a temporary sanction. The underlying historic
// sanction, evidence, author and audit are never rewritten when time expires.
export const belgianSanctionDay=(at=new Date())=>
 new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',
  month:'2-digit',day:'2-digit'}).format(at);
export function effectiveTemporarySanctionStatus(row,today=belgianSanctionDay()){
 const original=String(row?.status||'actief');
 if(row?.type!=='sanctie'||
   !['Tijdelijke beperking','Tijdelijke degradatie'].includes(row.sanctionType))
   return original;
 if(original==='ingetrokken'||original==='verwijderd')return original;
 if(/^\d{4}-\d{2}-\d{2}$/.test(String(row.endDate||''))&&
   row.endDate<today)return 'verlopen';
 return original==='historisch'?'actief · historisch overgenomen':original;
}
