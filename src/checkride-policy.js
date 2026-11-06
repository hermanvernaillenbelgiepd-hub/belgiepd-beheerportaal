import {roleForDepartment} from './leave-policy.js';

// Each track is an independent access boundary. Roles are exact Discord IDs.
export const CHECKRIDE_TRACKS=Object.freeze({
  motard:Object.freeze({code:'motard',dept:'politie',label:'Politie · MOTARD',
    instructor:'1359656762289946755',
    candidates:['1365602771855740958','1358148694297415741'],
    member:'1309532438053130326'}),
  k9:Object.freeze({code:'k9',dept:'politie',label:'Politie · K9',
    instructor:'1345302115689431061',
    candidates:['1345297414612979713','1309532437977497699'],
    member:'1309532438053130326'}),
  rago:Object.freeze({code:'rago',dept:'politie',label:'Politie · RAGO',
    instructor:'1393050551188721865',
    candidates:['1490841316656156802','1309532437977497700'],
    member:'1309532438053130326'}),
  ambulance_stage:Object.freeze({code:'ambulance_stage',dept:'ambulance',label:'Ambulance · stagiairs',
    instructor:'1309532437952466988',candidates:['1309532438053130323','1309532437977497697'],
    stage:true}),
  brandweer_stage:Object.freeze({code:'brandweer_stage',dept:'brandweer',label:'Brandweer · stagiairs',
    instructor:'1309532437952466989',candidates:['1309532438053130324'],stage:true}),
  burger_io:Object.freeze({code:'burger_io',dept:'burger',label:'Burger · BIO',
    instructor:'1492485336197234728',candidates:['1398985105254650007'],
    excluded:['1309532438019706966','1492485336197234728']})
});
const ID=/^\d{15,22}$/;
const SCORES=['kennis','praktijk','communicatie','veiligheid','zelfstandigheid'];
const OUTCOMES=['voldoende','verder_begeleiden','herkansing'];
const KINDS=['eerste','vervolg','eind'];
const eligibleId=value=>typeof value==='string'&&ID.test(value);
export function verifiedCheckrideRoles(member,guildId,now=Date.now(),maxAgeMs=15*60*1000){
  if(!eligibleId(guildId)||member?.guildId!==guildId||
    !Number.isSafeInteger(member?.verifiedAt)||
    member.verifiedAt>now||now-member.verifiedAt>maxAgeMs||
    !Array.isArray(member.roleIds)||!member.roleIds.every(eligibleId))return null;
  return new Set(member.roleIds);
}
function uniqueOwnService(roster,actor,dept){
  return roster.filter(p=>p?.dept===dept&&p.personId===actor.discordId).length===1;
}
export function permittedCheckrideTracks(actor,member,roster,guildId,now=Date.now()){
  if(!eligibleId(actor?.discordId)||actor.uid!=='discord:'+actor.discordId||
     !Array.isArray(roster))return [];
  if(actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true)
    return Object.keys(CHECKRIDE_TRACKS);
  const roles=verifiedCheckrideRoles(member,guildId,now);
  if(!roles)return [];
  return Object.values(CHECKRIDE_TRACKS).filter(track=>{
    // Burgerraad is a separate verified civilian role; managed portal grants
    // do not currently list burger as a normal cadre department. Require both
    // Burgerraad Discord proof and one unique burger roster entry instead.
    const civilianCouncil=track.dept==='burger'&&roles.has(track.instructor);
    if((!actor.departments?.includes(track.dept)&&!civilianCouncil)||
       !uniqueOwnService(roster,actor,track.dept))return false;
    if(roles.has(track.instructor))return true;
    if(track.dept==='politie'){
      const rank=roleForDepartment(actor,'politie');
      const proof=(rank==='middenkader'&&roles.has('1335578488664490057'))||
        (rank==='officierenkader'&&roles.has('1473474238664020151'))||
        (rank==='korpsleiding'&&roles.has('1562710901080068229'));
      return proof;
    }
    if(track.dept==='ambulance')return roles.has('1309532438053130325');
    if(track.dept==='brandweer')return roles.has('1395115819020714105');
    // Burgerraad role is itself the independent service proof.
    return false;
  }).map(t=>t.code);
}
export function eligibleCheckrideSubject(trackCode,person,member,guildId,now=Date.now()){
  const track=CHECKRIDE_TRACKS[trackCode];
  if(!track||person?.dept!==track.dept||!eligibleId(person?.personId))return false;
  // The protected 9xx police dossiers are not ordinary trainee candidates.
  if(track.dept==='politie'&&/^9[0-9]{2}$/.test(String(person.call||'').trim()))return false;
  const roles=verifiedCheckrideRoles(member,guildId,now,24*60*60*1000);
  if(!roles||!track.candidates.some(id=>roles.has(id))||
     (track.excluded||[]).some(id=>roles.has(id)))return false;
  if(track.member&&!roles.has(track.member))return false;
  if(track.stage){
    const official=[person.rank,person.call,person.status,person.series]
      .map(v=>String(v||'')).join(' ').toUpperCase();
    if(!/(?:STAG|IN OPLEIDING)/.test(official))return false;
  }
  return true;
}
function validDate(date,now=Date.now()){
  if(typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return false;
  const parsed=new Date(date+'T12:00:00Z');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  return !Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===date&&
    date>='2020-01-01'&&date<=today;
}
export function checkrideInput(body,now=Date.now()){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['track','subjectDiscordId','eventDate','kind','outcome','scores','notes'].includes(k)))
    throw Error('Ongeldig koppelritformulier');
  const track=CHECKRIDE_TRACKS[body.track];
  if(!track||!eligibleId(body.subjectDiscordId))throw Error('Ongeldige dienst, opleiding of kandidaat');
  if(!validDate(body.eventDate,now))throw Error('Ongeldige evaluatiedatum');
  if(!KINDS.includes(body.kind)||!OUTCOMES.includes(body.outcome))throw Error('Ongeldige ritsoort of eindbeoordeling');
  if(!body.scores||typeof body.scores!=='object'||Array.isArray(body.scores)||
     Object.keys(body.scores).length!==SCORES.length||
     SCORES.some(key=>!Number.isInteger(body.scores[key])||body.scores[key]<1||body.scores[key]>5))
    throw Error('Beoordeel de vijf criteria van 1 tot 5');
  if(typeof body.notes!=='string'||body.notes.trim().length<3||body.notes.length>1500||
     /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.notes))
    throw Error('Vul opmerkingen van 3 tot 1500 tekens in');
  const scores=Object.fromEntries(SCORES.map(key=>[key,body.scores[key]]));
  return {track:track.code,department:track.dept,subjectDiscordId:body.subjectDiscordId,
    eventDate:body.eventDate,kind:body.kind,outcome:body.outcome,scores,
    average:Math.round(SCORES.reduce((n,key)=>n+scores[key],0)/SCORES.length*10)/10,
    notes:body.notes.trim()};
}
