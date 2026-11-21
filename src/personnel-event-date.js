// A business event belongs to its actual local calendar day, not to the
// UTC day or to the later moment when an administrator enters its log.
const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
 year:'numeric',month:'2-digit',day:'2-digit'});
export function brusselsEventDate(value=new Date()){
 const date=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(date.getTime()))throw Error('Ongeldige gebeurtenistijd');
 return fmt.format(date);
}
export function scheduledTrainingEventDate(startAt){
 if(typeof startAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(startAt))
  throw Error('Geplande opleidingsdatum ontbreekt');
 return brusselsEventDate(startAt);
}
