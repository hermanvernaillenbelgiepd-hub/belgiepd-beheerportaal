// Safe startup diagnostic for the Firestore database backing Discord login.
// Never print service-account content, access tokens, project IDs or Discord IDs.
export function firebaseDiagnostic(error){
  const rawCode=error?.code;
  const code=typeof rawCode==='number'&&Number.isInteger(rawCode)?
    String(rawCode):typeof rawCode==='string'&&/^[a-zA-Z0-9_/-]{1,45}$/.test(rawCode)?
      rawCode:'unknown';
  const message=String(error?.message||'').toLowerCase();
  const category=
    code==='8'||code==='resource-exhausted'||/resource.exhausted|quota.exceeded|quota exhausted/.test(message)
      ?'firestore_quota_exhausted':
    code==='7'||code==='permission-denied'||/permission.denied|missing.or.insufficient.permissions/.test(message)
      ?'permission_denied':
    code==='16'||code==='unauthenticated'||/unauthenticated|invalid_grant/.test(message)
      ?'credentials_rejected':
    code==='5'||code==='not-found'||/database.*(not.exist|not.found)|firestore.*not.*created/.test(message)
      ?'firestore_database_not_found':
    /could not load the default credentials|default credentials are not available|application default credentials/.test(message)
      ?'credentials_missing':
    /project.id.*(not.set|not.configured|not.provided|missing)/.test(message)
      ?'project_missing':
    code==='14'||code==='unavailable'||/econn|enotfound|timeout|failed to connect|network/.test(message)
      ?'firestore_unavailable':
    code==='4'||code==='deadline-exceeded'?'firestore_timeout':'unexpected_error';
  return {code,category};
}
