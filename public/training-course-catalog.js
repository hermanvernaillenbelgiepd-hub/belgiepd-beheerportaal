// Centrale opleidingskeuzes voor het Opleidingsregister en Personeelsdossier.
// Alleen de selectielijsten veranderen; historische registraties blijven bestaan.
export const TRAINING_COURSE_CATALOG=Object.freeze({
  brandweer:Object.freeze([
    'Logistiek / Signalisatie','Ladderwagen','Duiker','Bosbestrijding',
    'Brandweer-AMBU','RED-TEAM','Gevaarlijke stoffen','Basistraining'
  ]),
  depannage:Object.freeze([
    'BASIS DEPANNAGE','F.A.S.T','CRANE','WEGENWERKEN',
    'AGENTSCHAP WEGEN EN VERKEER (LEIDING)'
  ]),
  ambulance:Object.freeze([
    'BASIS TRAINING','MEDICATIE','MUG-HELI','PIT','PIT-MOTOR',
    'VERPLEEGKUNDIGE','ARTS','MIP'
  ])
});
// Openbaar overzicht voor zelfbediening. Zichtbaarheid is geen aanvraagrecht:
 // de server controleert altijd de eigen personeelsfiche en het kader.
export const POLICE_REQUEST_COURSES=Object.freeze([
  'RADIO OPLEIDING (VERPLICHT)','RADIO OPLEIDING (VRIJWILLIG)',
  'BASISCURSIS','GEWELDBEHEERSING','WAPENGEBRUIK',
  'VERKEERSBEGELEIDING','VERKEERSCONTROLE','PRIORITAIR RIJDEN',
  'EHBO VOOR INTERVENIERENDEN','BEVEILIGEN OPENBARE WEG',
  'K-9','RAGO','MOTARD','MOTARD-OFF ROAD','DISPATCH',
  'BEVOEGDHEDEN TO','ERT AE-I','ERT AE-T','ERT-AE-F'
]);
export const TRAINING_REQUEST_COURSE_CATALOG=Object.freeze({
  politie:POLICE_REQUEST_COURSES,
  brandweer:TRAINING_COURSE_CATALOG.brandweer,
  ambulance:TRAINING_COURSE_CATALOG.ambulance,
  depannage:TRAINING_COURSE_CATALOG.depannage
});
export function coursesForDepartment(dept){
  return TRAINING_COURSE_CATALOG[dept]||null;
}
export const trainingSelectLabels=Object.freeze({
  brandweer:'Kies een Brandweeropleiding…',
  depannage:'Kies een Depannageopleiding…',
  ambulance:'Kies een Ambulanceopleiding…',
  politie:'Kies een opleiding…'
});

/* Explicit mappings only: display qualification, never grant Discord permissions. */
export const TRAINING_SPECIALTY_COURSES=Object.freeze({
 politie:Object.freeze({'K-9':'K9','RAGO':'RAGO','MOTARD':'Motor','DISPATCH':'Dispatch',
   'BEVOEGDHEDEN TO':'TO','ERT AE-I':'AE','ERT AE-T':'AE','ERT-AE-F':'AE',
   'PRIORITAIR RIJDEN':'Prioritair rijden'}),
 brandweer:Object.freeze({'Logistiek / Signalisatie':'Logistiek / Signalisatie',
   'Ladderwagen':'Ladderwagen','Duiker':'Duiker','Bosbestrijding':'Bosbestrijding',
   'Brandweer-AMBU':'Brandweer-AMBU','RED-TEAM':'RED team',
   'Gevaarlijke stoffen':'Gevaarlijke stoffen','Basistraining':'Basis TR'}),
 ambulance:Object.freeze({'BASIS TRAINING':'Basis TR','MEDICATIE':'Medicatie',
   'MUG-HELI':'HELI','MIP':'MIP','PIT-MOTOR':'PIT-MOTOR'}),
 depannage:Object.freeze({'F.A.S.T':'F.A.S.T','CRANE':'CRANE','WEGENWERKEN':'WEGENWERKEN'})
});
export function qualificationSpecialty(dept,courseName){
 return TRAINING_SPECIALTY_COURSES[dept]?.[courseName]||null;
}
export function trainingSpecialtyCandidate(record){
 const label=qualificationSpecialty(record?.department,record?.courseName);
 if(!label)return null;
 if(record.result==='geslaagd')return {label,value:'Ja'};
 if(record.result==='aanwezig'&&record.qualificationStage==='in_opleiding')
   return {label,value:'Stage'};
 return null;
}
