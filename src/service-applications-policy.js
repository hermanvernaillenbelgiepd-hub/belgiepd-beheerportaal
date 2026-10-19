// Candidate dossiers are separate from active service personnel and police cases.
// This pure policy does not grant access or create a dossier by itself.
// A trusted FiveM server-side source must attest both time conditions.
export const SERVICE_APPLICATIONS_COLLECTION='bpd_service_applications';
export const APPLICATION_SERVICES=Object.freeze(['ambulance','brandweer','depannage']);
export const MIN_SERVER_PLAY_SECONDS=10*60*60;
export const MIN_SERVER_AGE_DAYS=5;
const FIVE_DAYS_MS=MIN_SERVER_AGE_DAYS*24*60*60*1000;
const MAX_EVIDENCE_AGE_MS=24*60*60*1000;
const DISCORD_ID=/^\d{15,22}$/;

export function serviceApplicantDossierId(dept,discordId){
  if(!APPLICATION_SERVICES.includes(dept)||!DISCORD_ID.test(discordId))
    throw Error('Ongeldige sollicitatiehulpdienst of Discord-identiteit');
  return dept+'_'+discordId;
}

export function assessServiceApplicant(evidence,now=Date.now()){
  const base={eligible:false,playHoursMet:false,membershipDaysMet:false,
    requiredHours:10,requiredDays:5};
  // No manual/self-declared playtime or Discord-join timestamp can qualify.
  if(!evidence||evidence.source!=='trusted_fivem_server'||
      !Number.isSafeInteger(evidence.totalPlaySeconds)||evidence.totalPlaySeconds<0||
      typeof evidence.firstServerJoinAt!=='string'||
      typeof evidence.verifiedAt!=='string'||
      !Number.isFinite(now))
    return {...base,status:'verification_required'};
  const joinedAt=Date.parse(evidence.firstServerJoinAt);
  const verifiedAt=Date.parse(evidence.verifiedAt);
  if(!Number.isFinite(joinedAt)||!Number.isFinite(verifiedAt)||
     joinedAt>verifiedAt||verifiedAt>now+60000||
     now-verifiedAt>MAX_EVIDENCE_AGE_MS||now-joinedAt<0)
    return {...base,status:'verification_required'};
  const playHoursMet=evidence.totalPlaySeconds>=MIN_SERVER_PLAY_SECONDS;
  const membershipDaysMet=now-joinedAt>=FIVE_DAYS_MS;
  return {...base,playHoursMet,membershipDaysMet,
    eligible:playHoursMet&&membershipDaysMet,
    status:playHoursMet&&membershipDaysMet?'eligible':'not_yet_eligible'};
}

export function validateServiceApplicationDraft(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    throw Error('Ongeldige sollicitatie');
  // Identity, hours, join time, rank, service permissions and status are never
  // accepted from application forms: backend derives them from verified sources.
  const allowed=new Set(['dept','motivation']);
  if(Object.keys(payload).some(k=>!allowed.has(k)))
    throw Error('Niet-toegelaten sollicitatieveld');
  if(!APPLICATION_SERVICES.includes(payload.dept))
    throw Error('Kies ambulance, brandweer of depannage');
  const motivation=typeof payload.motivation==='string'?payload.motivation.trim():'';
  if(motivation.length<40||motivation.length>3000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(motivation))
    throw Error('Sollicitatiemotivatie moet 40 tot 3000 tekens bevatten');
  return {dept:payload.dept,motivation};
}
