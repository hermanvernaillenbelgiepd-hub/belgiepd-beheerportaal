// One privacy-scoped request workflow. Existing leave permissions decide which
// request documents may be read; this helper never fetches other identities.
const discord=/^\d{15,22}$/;
const clean=(value,max=150)=>typeof value==='string'?value.trim().slice(0,max):'';
function who(value,id,fallback=null){
 const identity=discord.test(String(id||''))?String(id):null;
 if(value&&typeof value==='object'&&
    (!identity||!value.discordId||String(value.discordId)===identity)){
  const name=clean(value.name,120),call=clean(value.call,24);
  return {discordId:identity||clean(value.discordId,22)||null,
    name:name||null,call:call||null};
 }
 return fallback?{...fallback,discordId:identity||fallback.discordId||null}:
  identity?{discordId:identity,name:null,call:null}:null;
}
export function leaveRequestWorkflow(request){
 const r=request&&typeof request==='object'?request:{};
 const applicant=who({name:r.subjectName,call:r.subjectCall},r.personDiscordId);
 const submittedBy=who(r.submittedByActor,r.submittedByDiscordId,
  r.submittedByDiscordId===r.personDiscordId?applicant:null);
 const manual=r.manual===true;
 const originalRecorder=manual&&r.historicalImport===true?
  who(r.registeredBy,r.registeredBy?.discordId):null;
 const system=r.decidedBy==='system'||r.autoApproved===true&&
  r.status==='approved'&&!r.decidedByDiscordId;
 const decidedBy=system?{name:'Systeem · automatische goedkeuring',call:null,discordId:null}:
  who(r.decidedByActor,r.decidedByDiscordId,
    manual&&r.status==='approved'&&r.decidedByDiscordId===r.submittedByDiscordId?submittedBy:null);
 return {applicant,submittedBy,originalRecorder,manual,
  submittedOnBehalf:manual&&r.submittedByDiscordId!==r.personDiscordId,
  decidedBy:decidedBy||null,
  decisionNote:clean(r.decisionNote,300)||null,
  mode:system?'automatic':manual?'manual':'self',
  extensionOf:clean(r.extensionOf,200)||null};
}
