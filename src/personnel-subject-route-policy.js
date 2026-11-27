// Only reads/edits of an EXISTING staff dossier require a unique target
// before the route handler runs. Registering a NEW person deliberately has
// no existing subject. The creation endpoint performs its own strict
// authorization, uniqueness, lifecycle and rank validation.
export function requiresExistingPersonnelSubject(path){
  if(typeof path!=='string'||path==='/api/personnel/new')return false;
  return /^\/api\/(?:personnel\/|staff-dossiers\/|training\/|registrations\/entries(?:\/|$)|management\/cases(?:\/|$)|dossiercentrum\/)/.test(path);
}
