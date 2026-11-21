// Only display STAGE when the actual personnel status explicitly identifies a trainee.
// Training status for individual specializations does not imply general stage.
export function isOfficialStageStatus(status){
 const normalized=typeof status==='string'?status.trim().toUpperCase().replace(/\s+/g,' '):'';
 return ['STAGE','STAG','STAGIAIR','STAGIAIRE','IN STAGE'].includes(normalized);
}
