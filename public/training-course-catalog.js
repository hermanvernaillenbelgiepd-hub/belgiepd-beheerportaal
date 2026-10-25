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
