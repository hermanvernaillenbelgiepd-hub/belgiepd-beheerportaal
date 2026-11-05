// BelgiumPD v0.7 – veilige planning van 200-299, zonder mutatie van brongegevens.
export const isDiscordId = value => /^\d{15,22}$/.test(String(value ?? '').trim());
// BelgiumPD nummerverdeling: 10-tallen, vervolgens 5-tallen, vervolgens
// de overige nummers. Gebruik dezelfde volgorde voor tijdelijk en vast,
// zonder reeksen of de feitelijke Discord-kaderrol met elkaar te verwarren.
export function orderedCallNumbers(min,max){
  if(!Number.isInteger(min)||!Number.isInteger(max)||min>max||min<0||max>9999)
    throw new Error('Ongeldige roepnummerreeks');
  const priority=n=>n%10===0?0:n%5===0?1:2;
  return Array.from({length:max-min+1},(_,i)=>min+i)
    .sort((a,b)=>priority(a)-priority(b)||a-b);
}
export function preferredFreeCall(min,max,used){
  const occupied=new Set(Array.from(used||[],v=>Number(v)));
  return orderedCallNumbers(min,max).find(call=>!occupied.has(call))??null;
}
// Explicit preferred Police Agent calls. Other numbers retain the historic
// 10-5-1 order. A preview does not reserve a number.
export const POLICE_INTAKE_PRIORITY=Object.freeze([200,210,220,215,225,201,202]);
export function orderedPoliceIntakeCalls(){
 const preferred=new Set(POLICE_INTAKE_PRIORITY);
 return [...POLICE_INTAKE_PRIORITY,...orderedCallNumbers(200,299).filter(x=>!preferred.has(x))];
}
export function policeCallNumber(raw){
 const match=/^(?:S[- ]?)?(2\d\d)$/i.exec(String(raw??'').trim());
 return match?Number(match[1]):null;
}
export function occupiedPoliceCalls({records=[],personnelClaims=[],fixedReservations=[]}={}){
 const used=new Set();
 for(const person of records){
  if(person?.dept!=='politie')continue;
  const call=policeCallNumber(person.call);if(call!==null)used.add(call);
 }
 for(const claim of [...personnelClaims,...fixedReservations]){
  const call=policeCallNumber(claim?.call??claim?.id);
  if(call!==null)used.add(call);
 }
 return used;
}
export function firstFreePoliceCall(input={}){
 const used=occupiedPoliceCalls(input);
 return orderedPoliceIntakeCalls().find(x=>!used.has(x))??null;
}
const s = v => String(v ?? '').trim();
export const canReview = role => ['middenkader','officierenkader','korpsleiding'].includes(role);
export const canDecide = role => ['officierenkader','korpsleiding'].includes(role);
export function checkApplicant({name, discordId, temporaryCall}, {allowMissingTemporary=false}={}) {
  const n=s(name), id=s(discordId), call=s(temporaryCall);
  if (n.length < 2 || n.length > 80 || /[\r\n\t]/.test(n) || /^[=+@-]/.test(n)) throw new Error('Ongeldige personeelsnaam');
  if (!isDiscordId(id)) throw new Error('Ongeldige Discord ID');
  if (!(allowMissingTemporary&&call==='') && (!/^\d{3}$/.test(call) || Number(call)<101 || Number(call)>199)) throw new Error('Tijdelijk roepnummer moet tussen 101 en 199 liggen');
  return {name:n,discordId:id,temporaryCall:call};
}
export function eligibility({joinedOn, playHours}, now = new Date()) {
  const date=s(joinedOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw new Error('Ongeldige toetredingsdatum');
  const hours=Number(playHours);
  if (!Number.isFinite(hours)||hours<0||hours>100000||!Number.isSafeInteger(Math.round(hours*60))) throw new Error('Ongeldige speeltijd');
  // Met alleen een datum (zonder join-tijd) rekenen we vanaf het einde van die dag.
  const fiveFullDays=(now.getTime()-Date.parse(date+'T23:59:59Z'))>=5*86400000;
  const hasHours=hours>=10;
  return {joinedOn:date,playHours:hours,hasFiveDays:fiveFullDays,hasTenHours:hasHours,eligible:fiveFullDays&&hasHours};
}
export function planPoliceSheetSync({policeRows, infoRows, name, discordId, preferredCall, unavailableCalls=[]}) {
  const n=s(name),id=s(discordId);
  if(n.length<2||n.length>80||/^[=+@-]/.test(n)||/[\n\r]/.test(n)||!isDiscordId(id))throw new Error('Ongeldige aanvraaggegevens');
  if(!Array.isArray(policeRows)||!Array.isArray(infoRows))throw new Error('Brongegevens ontbreken');
  const norm=v=>s(v).toLocaleLowerCase('nl');
  // Existing recruits can already have a 101–199 temporary police record.
  // Move their verified identity into a free permanent slot, preserving the
  // existing PolitieInfo identity row and the Discord-linked dossier.
  const identityPolice=policeRows.map((row,i)=>({row,i:i+1}))
    .filter(x=>s(x.row?.[17])===id);
  const temporary=identityPolice.length===1&&
    /^1\d{2}$/.test(s(identityPolice[0].row?.[0]))&&
    norm(identityPolice[0].row?.[3])===norm(n)&&
    /Agent van Politie\s*\(AP\)/i.test(s(identityPolice[0].row?.[2]))
      ?identityPolice[0]:null;
  if(identityPolice.length&&(!temporary||identityPolice.length!==1))
    throw new Error('Discord ID bestaat al met een niet-tijdelijk of dubbel politieroepnummer');
  const identityInfo=infoRows.map((row,i)=>({row,i:i+1}))
    .filter(x=>s(x.row?.[15])===id);
  if(identityInfo.length>1||identityInfo.length&&!temporary||
    identityInfo.length&&norm(identityInfo[0].row?.[0])!==norm(n))
    throw new Error('Discord ID bestaat al in PolitieInfo; handmatige controle nodig');
  if(policeRows.some((row,i)=>norm(row?.[3])===norm(n)&&i+1!==temporary?.i)||
    infoRows.some((row,i)=>norm(row?.[0])===norm(n)&&i+1!==identityInfo[0]?.i))
    throw new Error('Personeelsnaam bestaat al; controleer handmatig of dit een andere speler is');
  const slots=policeRows.map((r,i)=>({row:i+1,call:Number(s(r?.[0])),rawCall:s(r?.[0]),name:s(r?.[3]),rank:s(r?.[2])}))
    .filter(x=>Number.isInteger(x.call)&&x.call>=200&&x.call<=299&&String(x.call)===x.rawCall&&/Agent van Politie\s*\(AP\)/i.test(x.rank));
  const counts=new Map();for(const x of slots)counts.set(x.call,(counts.get(x.call)||0)+1);
  const callPriority=new Map(orderedPoliceIntakeCalls().map((call,index)=>[call,index]));
  const unavailable=new Set([...unavailableCalls].map(Number));
  const candidates=slots.filter(x=>!x.name&&counts.get(x.call)===1&&!unavailable.has(x.call))
    .sort((a,b)=>callPriority.get(a.call)-callPriority.get(b.call));
  const preferred=preferredCall===undefined||preferredCall===null||s(preferredCall)===''?null:Number(s(preferredCall));
  if(preferred!==null&&(!Number.isInteger(preferred)||preferred<200||preferred>299))throw new Error('Roepnummer buiten de 200-reeks');
  const selected=preferred===null?candidates[0]:candidates.find(x=>x.call===preferred);
  if(!selected)throw new Error('Geen vrij, uniek roepnummer beschikbaar (of gevraagde nummer is bezet)');
  let lastOccupied=0;
  for(let i=0;i<infoRows.length;i++)if((infoRows[i]||[]).some(v=>s(v)!==''))lastOccupied=i+1;
  const infoRow=identityInfo[0]?.i||lastOccupied+1;
  if(infoRow>658)throw new Error('PolitieInfo heeft geen vrije rij meer; controleer de spreadsheet');
  if(!identityInfo.length&&(infoRows[infoRow-1]||[]).some(v=>s(v)!==''))
    throw new Error('Doelrij in PolitieInfo is niet leeg');
  return {call:selected.call,policeRow:selected.row,infoRow,
    temporaryPoliceRow:temporary?.i||null,temporaryCall:temporary?s(temporary.row[0]):null,
    discordId:id,name:n,rank:'Agent van Politie (AP)',
    remainingFree:candidates.length,
    internalLink:`/registraties.html?dept=politie&discordId=${encodeURIComponent(id)}`};
}
export function policeSheetUpdates(plan){
  return [
    {range:`PolitieInfo!A${plan.infoRow}`,values:[[plan.name]]},
    {range:`PolitieInfo!C${plan.infoRow}`,values:[['Actief']]},
    {range:`PolitieInfo!P${plan.infoRow}`,values:[[plan.discordId]]},
    {range:`PolitieInfo!O${plan.infoRow}`,values:[[ `=IFERROR(XLOOKUP(A${plan.infoRow},POLITIE!D:D,POLITIE!A:A,"",0),"")` ]]},
    {range:`POLITIE!D${plan.policeRow}`,values:[[plan.name]]},
    ...(Number.isInteger(plan.temporaryPoliceRow)?
      [{range:`POLITIE!D${plan.temporaryPoliceRow}`,values:[['']]}]:[])
  ];
}
