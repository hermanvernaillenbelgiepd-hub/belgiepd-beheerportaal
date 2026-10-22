import {roleForDepartment} from './leave-policy.js';
// Nieuwe interne dossierregistraties en concept-weekrapporten.
// Geen Google Sheets-writes, geen clientvertrouwen bij rollen of auteurs.
export const MANAGEMENT_TYPES = Object.freeze(['verlof','notitie','opleiding','naamswijziging','promotievoorstel','personeelsbeweging','activiteit','specialisatiebeperking']);
export const CADRE_ROLES = Object.freeze(['middenkader','officierenkader','korpsleiding']);
export const HIGH_ROLES = Object.freeze(['officierenkader','korpsleiding']);
export const RECORD_LABELS = Object.freeze({
  observatie:'Observatie', sanctie:'Sanctie', verlof:'Verlof', notitie:'Personeelsnotitie',
  opleiding:'Afgeronde opleiding', activiteit:'Dienstactiviteit',
  specialisatiebeperking:'Specialisatiebeperking', naamswijziging:'Naamswijziging',
  promotievoorstel:'Promotievoorstel', personeelsbeweging:'Personeelsbeweging'
});
export const validDiscord = id => /^\d{15,22}$/.test(String(id??''));
export const allowedDept = (actor,dept) => ['politie','ambulance','brandweer','depannage'].includes(dept) && actor?.departments?.includes(dept);
export const mayReadManagement = (actor,dept) => allowedDept(actor,dept) &&
  (CADRE_ROLES.includes(roleForDepartment(actor,dept))||
   actor?.dossierFullDepartments?.includes(dept));
export const mayWriteManagement = (actor,dept,type) => (
  // Delegated case management can add only routine dossier notes.
  // This does not convey sanctions, rank changes or other personnel powers.
  (['notitie','opleiding'].includes(type)&&actor?.dossierFullDepartments?.includes(dept)&&
    actor?.dossierAllowedDepartments?.includes(dept)&&allowedDept(actor,dept))
  ||(type==='notitie'&&Array.isArray(actor?.dossierManageDepartments)&&
    actor.dossierManageDepartments.includes(dept)&&actor.dossierAllowedDepartments?.includes(dept))
  ||(CADRE_ROLES.includes(roleForDepartment(actor,dept))&&mayReadManagement(actor,dept) &&
    (!Array.isArray(actor?.dossierNativeDepartments)||actor.dossierNativeDepartments.includes(dept))&&
    MANAGEMENT_TYPES.includes(type) && (
    !['naamswijziging','personeelsbeweging'].includes(type) ||
    HIGH_ROLES.includes(roleForDepartment(actor,dept))
  ))
);
export const mayDecide = actor => actor?.portalTechnicalMode===true||actor?.fireZoneChief===true||HIGH_ROLES.includes(actor?.role);
// Rapportinhoud raadplegen kan vanaf middenkader; bestanden exporteren alleen voor hogere kaderrollen, binnen de toegestane dienst.
export const mayExportWeekReport = (actor,dept) => mayReadManagement(actor,dept) && (actor.portalTechnicalMode===true||dept==='brandweer'&&actor.fireZoneChief===true||HIGH_ROLES.includes(actor.role));
// Testregistraties mogen alleen door hogere leiding worden geclassificeerd.
// De classificatie verwijdert geen dossiers en verandert geen sanctiebevoegdheden.
export const mayClassifyTest = (actor,dept) => mayReadManagement(actor,dept) && (actor.portalTechnicalMode===true||dept==='brandweer'&&actor.fireZoneChief===true||HIGH_ROLES.includes(actor.role));
export const isTestRecord = record => record?.testRecord === true;
export function validateTestClassification(value){
  if(typeof value?.testRecord !== 'boolean')throw new Error('Ongeldige testmarkering');
  const reason=requiredText(value?.reason,500,'Reden testmarkering');
  return {testRecord:value.testRecord,reason};
}

function requiredText(value,max,label){if(typeof value!=='string')throw new Error(label+' ontbreekt');const t=value.trim();if(!t||t.length>max)throw new Error(label+' is verplicht (maximaal '+max+' tekens)');return t;}
function optionalText(value,max,label){if(value===undefined||value===null||value==='')return '';if(typeof value!=='string'||value.trim().length>max)throw new Error('Ongeldige '+label);return value.trim();}
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function parseDate(value,label='Datum'){if(!validDate(value))throw new Error('Ongeldige '+label);return value;}
export function validateManagementEntry(value){
  if(!MANAGEMENT_TYPES.includes(value?.type))throw new Error('Ongeldig registratietype');
  const type=value.type;
  const eventDate=parseDate(value.eventDate);
  const details=requiredText(value.details,4000,'Omschrijving');
  const result={type,eventDate,details,reportCategory:type};
  if(type==='verlof'){
    const endDate=parseDate(value.endDate,'einddatum');
    if(endDate<eventDate)throw new Error('Einddatum ligt vóór de begindatum');
    result.endDate=endDate;
  }
  if(type==='opleiding')result.courseName=requiredText(value.courseName,150,'Naam van de opleiding');
  if(type==='naamswijziging')result.newName=requiredText(value.newName,100,'Nieuwe naam');
  if(type==='promotievoorstel')result.proposedRank=requiredText(value.proposedRank,140,'Voorgestelde graad');
  if(type==='personeelsbeweging')result.movement=requiredText(value.movement,150,'Personeelsbeweging');
  const referenceUrl=optionalText(value.referenceUrl,800,'bewijslink');
  if(referenceUrl){let u;try{u=new URL(referenceUrl)}catch{throw new Error('Ongeldige bewijslink')};if(u.protocol!=='https:')throw new Error('Ongeldige bewijslink');result.referenceUrl=u.href;}
  return result;
}
export function validateWeekReport(value){
  const title=requiredText(value?.title,120,'Rapporttitel');
  const dept=optionalText(value?.dept,30,'hulpdienst');
  if(!['politie','ambulance','brandweer','depannage'].includes(dept))throw new Error('Ongeldige hulpdienst');
  const start=parseDate(value?.periodStart,'begindatum');
  const end=parseDate(value?.periodEnd,'einddatum');
  if(end<start)throw new Error('Rapportperiode is omgekeerd');
  const days=1+(new Date(end+'T12:00:00Z')-new Date(start+'T12:00:00Z'))/86400000;
  if(days>31)throw new Error('Rapportperiode mag maximaal 31 dagen omvatten');
  return {title,dept,periodStart:start,periodEnd:end,status:'concept'};
}
export function isInPeriod(entry,start,end){
  return typeof entry?.eventDate==='string' && entry.eventDate>=start && entry.eventDate<=end;
}
export function reportSections(entries,start,end){
  const selected=entries.filter(e=>isInPeriod(e,start,end) && !isTestRecord(e)).sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||String(a.subjectCallAtCreation||'').localeCompare(String(b.subjectCallAtCreation||'')));
  return Object.keys(RECORD_LABELS).map(type=>({type,label:RECORD_LABELS[type],entries:selected.filter(e=>e.type===type)}));
}
export function uniqueSubject(persons,dept,discordId){
  if(!validDiscord(discordId))return null;
  const matches=persons.filter(p=>p.dept===dept && p.personId===discordId);
  return matches.length===1?matches[0]:null;
}
export const safeReportId=id=>/^[A-Za-z0-9]{12,30}$/.test(String(id??''));
