// Canonical course outcomes. Legacy labels stay readable for historical records.
export const TRAINING_RESULTS=Object.freeze(['aanwezig','geslaagd','niet_geslaagd','onderbroken']);
export const LEGACY_TRAINING_RESULTS=Object.freeze(['in_opleiding','stage','restricted']);
export const TRAINING_RESULT_LABELS=Object.freeze({
 aanwezig:'Aanwezig',geslaagd:'Geslaagd',niet_geslaagd:'Niet geslaagd',
 onderbroken:'Onderbroken',in_opleiding:'In opleiding (historisch)',
 stage:'Stage (historisch)',restricted:'RESTRICTED (historisch)',
 deelname_bevestigd:'Deelname bevestigd (zonder resultaat)'
});
export function isTrainingResult(result){
 return Object.hasOwn(TRAINING_RESULT_LABELS,String(result||''))&&result!=='deelname_bevestigd';
}
export function isCurrentTrainingResult(result){return TRAINING_RESULTS.includes(result)}
