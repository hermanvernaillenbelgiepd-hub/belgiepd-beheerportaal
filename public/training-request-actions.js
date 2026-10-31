// Shared UI for the five safe actions. Only the server authorizes them.
export const TRAINING_LABELS=Object.freeze({
 nieuw:'NIEUW',gelezen:'GELEZEN',gepland:'GEPLAND',
 afgewezen:'AFGEWEZEN',uitgevoerd:'UITGEVOERD',
 gegeven:'GEGEVEN (historiek)',gewist:'GEARCHIVEERD'
});
export const TRAINING_ACTIONS=Object.freeze([
 ['gelezen','GELEZEN'],['gepland','GEPLAND'],['afgewezen','AFGEWEZEN'],
 ['uitgevoerd','UITGEVOERD'],['wissen','WISSEN']
]);
export function availableTrainingActions(item){
 if(!item||typeof item!=='object')return [];
 const status=item.status,manager=item.canSchedule===true;
 if(status==='nieuw')
  return manager?['gelezen','gepland','afgewezen']:['gelezen','afgewezen'];
 if(status==='gelezen')return manager?['gepland','afgewezen']:['afgewezen'];
 if(status==='gepland')return manager?['uitgevoerd']:[];
 if(status==='uitgevoerd'||status==='gegeven')return ['wissen'];
 return [];
}
export function trainingActionData(action){
 if(action==='gepland'){
  const when=window.prompt('Begin: YYYY-MM-DDTHH:MM (lokale tijd België)');
  if(!when)return null;
  const until=window.prompt('Einde: YYYY-MM-DDTHH:MM (lokale tijd België)');
  if(!until)return null;
  const location=window.prompt('Locatie van de opleiding');
  if(!location)return null;
  const start=new Date(when),end=new Date(until);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())){
   window.alert('Gebruik een geldige datum en uur');return null;
  }
  return {action,startAt:start.toISOString(),endAt:end.toISOString(),location};
 }
 if(action==='afgewezen'){
  const reason=window.prompt('Reden van afwijzing (minimaal 5 tekens)');
  return reason?.trim()?.length>=5?{action,reason:reason.trim()}:null;
 }
 if(action==='uitgevoerd'){
  return window.confirm('Bevestig je dat deze opleiding daadwerkelijk plaatsvond en de persoon deelnam?')?
   {action,attendanceConfirmed:true}:null;
 }
 if(action==='wissen'){
  return window.confirm('Archiveren uit het actieve overzicht? Historiek, dossier en weekrapport blijven bewaard.')?
   {action}:null;
 }
 return {action};
}
export function trainingStateText(r){
 if(r.status==='gepland')
  return 'Gepland: '+(r.scheduledStartAt?
    new Date(r.scheduledStartAt).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'}):'')+
    ' · '+(r.scheduledLocation||'Locatie volgt');
 if(r.status==='afgewezen')return 'Afgewezen · '+(r.rejectionReason||'');
 if(r.status==='uitgevoerd'||r.status==='gegeven')return 'Opleiding uitgevoerd en gelogd';
 if(r.status==='gewist')return 'Gearchiveerd; dossier- en weekrapporthistoriek blijft behouden';
 if(r.status==='gelezen')return 'Gelezen door bevoegd kader of reekshoofd';
 return 'Nieuw · wacht op behandeling';
}
