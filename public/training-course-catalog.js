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
export function coursesForDepartment(dept){
  return TRAINING_COURSE_CATALOG[dept]||null;
}
export const trainingSelectLabels=Object.freeze({
  brandweer:'Kies een Brandweeropleiding…',
  depannage:'Kies een Depannageopleiding…',
  ambulance:'Kies een Ambulanceopleiding…',
  politie:'Kies een opleiding…'
});
