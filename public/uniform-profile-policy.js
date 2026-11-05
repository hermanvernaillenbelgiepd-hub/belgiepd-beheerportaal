// Presentation-only uniform grouping; never alters operational ranks or access.
// Stable names are used for explicitly configurable image assignment rules.
export const POLICE_UNIFORM_GROUPS=Object.freeze([
 {code:'agentenkader',label:'Agentenkader — 100/200'},
 {code:'basis_tm_ahinp',label:'Basiskader t.e.m. A-HINP — 300/400/500/600'},
 {code:'hinp_1hinp',label:'HINP en 1-HINP'},
 {code:'officieren',label:'Officierenkader en Korpsleiding'}
]);
export const POLICE_CALL_GRADES=Object.freeze([
 ['100','Agent van Politie'],['200','Agent van Politie'],
 ['300','Aspirant Inspecteur'],['400','Inspecteur'],
 ['500','Eerste Inspecteur'],['600','Aspirant Hoofdinspecteur'],
 ['700','Hoofdinspecteur'],['800','Eerste Hoofdinspecteur'],
 ['900','Eerste Hoofdcommissaris'],['910','Eerste Commissaris'],
 ['920','Aspirant Commissaris'],['930','Aspirant Commissaris']
]);
export const AMBULANCE_FUNCTIONS=Object.freeze([
 ['stag','Stagiair'],
 ['ambulancier','Ambulancier (AMB)'],
 ['hamb','H-AMB'],
 ['vpk','Verpleegkundige (VPK)'],
 ['hvpk','H-VPK'],
 ['arts','Arts (ARTS)'],
 ['harts','H-ARTS'],
 ['dirmed','DIRMED — functieopschrift']
]);
// Higher-grade AZLS uniform designs can be saved independently. Until saved,
// existing base uniforms stay available for display and editing (visual only).
export const AMBULANCE_UNIFORM_FALLBACK=Object.freeze({
 hamb:'ambulancier',hvpk:'vpk',harts:'arts'
});
export const ambulanceUniformFallback=code=>AMBULANCE_UNIFORM_FALLBACK[code]||'';
// Citizen uniforms follow verified Burger/Burgerraad/Burger-IO membership.
 // This only selects artwork and never modifies personnel rank/permissions.
export const BURGER_UNIFORM_GRADES=Object.freeze([
 ['burgerraad','Burgerraad'],
 ['burger','Burger'],
 ['burger_in_opleiding','Burger in opleiding (BIO)']
]);
export function citizenUniformRank(person){
 if(person?.dept!=='burger')return '';
 const groups=Array.isArray(person.burgerGroups)?
  person.burgerGroups.map(normalizeVisual):[];
 // Verified Discord membership controls which image to show when present.
 if(groups.includes('burgerraad'))return 'burgerraad';
 if(groups.includes('burger'))return 'burger';
 if(groups.includes('burger_io')||groups.includes('burger_in_opleiding'))return 'burger_in_opleiding';
 // Older citizen records may have a rank but no live role check.
 const rank=normalizeVisual(person.rank);
 if(rank==='burgerraad')return 'burgerraad';
 if(['burger_io','burger_in_opleiding','bio'].includes(rank))return 'burger_in_opleiding';
 return 'burger'; // presentation fallback; not a membership assertion
}
export const DEPANNAGE_FUNCTIONS=Object.freeze([
 ['awv','AWV — Leiding'],
 ['lsra','LSRA — Depannage'],
 ['fast','F.A.S.T. — FAST']
]);
export function normalizeVisual(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
}
// Shared, strictly numeric display interpretation. Never changes a person's
// actual roepnummer or the authorization source of their rank.
export function policeCallDigits(call){
 const raw=String(call||'').trim().toUpperCase();
 const match=/^(?:SANTO[ -]?|S)?([1-9][0-9]{2})\*?$/.exec(raw);
 return match?match[1]:'';
}
export function policeCallSeries(call){
 const digits=policeCallDigits(call);
 if(!digits)return '';
 const number=Number(digits);
 if(number>=900){
  const decade=Math.floor(number/10)*10;
  return ['900','910','920','930'].includes(String(decade))?String(decade):'';
 }
 return String(Math.floor(number/100)*100);
}
export function policeUniformGroup(person){
 if(person?.dept!=='politie')return '';
 const series=policeCallSeries(person.call);
 const n=Number(series);
 if(series&&(n===100||n===200))return 'agentenkader';
 if(series&&n>=300&&n<=600)return 'basis_tm_ahinp';
 if(series&&n>=700&&n<=800)return 'hinp_1hinp';
 if(series&&n>=900&&n<=930)return 'officieren';
 // For legacy records with no usable call, infer display group from a known rank.
 const rank=normalizeVisual(person.rank);
 if(rank==='agent_van_politie'||rank==='ap')return 'agentenkader';
 if(['aspirant_inspecteur','inspecteur','eerste_inspecteur',
  'aspirant_hoofdinspecteur','a_hinp'].includes(rank))return 'basis_tm_ahinp';
 if(['hoofdinspecteur','eerste_hoofdinspecteur'].includes(rank))return 'hinp_1hinp';
 if(['aspirant_commissaris','commissaris','eerste_commissaris',
  'eerste_hoofdcommissaris'].includes(rank))return 'officieren';
 return '';
}
export function ambulanceFunction(person){
 if(person?.dept!=='ambulance')return '';
 const raw=String(person.call||'').trim().toUpperCase().replace(/\s+/g,'')
  .replace(/^H-(?=ARTS|VPK|AMB)/,'H');
 const prefix=/^(DIRMED|HARTS|HVPK|HAMB|ARTS|VPK|AMB|STAGIAIR|STAGE|STAG)(?:[-_0-9*]|$)/.exec(raw)?.[1];
 if(prefix==='DIRMED')return 'dirmed';
 if(prefix==='HARTS')return 'harts';
 if(prefix==='HVPK')return 'hvpk';
 if(prefix==='HAMB')return 'hamb';
 if(prefix==='ARTS')return 'arts';
 if(prefix==='VPK')return 'vpk';
 if(prefix==='AMB')return 'ambulancier';
 if(['STAGIAIR','STAGE','STAG'].includes(prefix))return 'stag';
 const rank=normalizeVisual(person.rank);
 if(rank==='dirmed'||rank==='dir_med'||rank.includes('directeur_medisch'))return 'dirmed';
 if(['stag','stage','stagiair','ambulance_stagiair'].includes(rank))return 'stag';
 if(['harts','h_arts','hoofd_arts','hoofdarts'].includes(rank))return 'harts';
 if(['hvpk','h_vpk','hoofd_verpleegkundige','hoofdverpleegkundige'].includes(rank))return 'hvpk';
 if(['hamb','h_amb','hoofd_ambulancier','hoofdambulancier'].includes(rank))return 'hamb';
 if(rank.includes('verpleegkundige')||rank==='vpk')return 'vpk';
 if(rank==='arts'||rank.includes('_arts'))return 'arts';
 if(rank==='ambulancier'||rank==='ambulance'||rank==='amb')return 'ambulancier';
 return '';
}
// Depot uniforms are keyed to the towing function, not an often-empty rank.
 // A CRANE role is a specialization and never selects a separate coat.
export function depannageFunction(person){
 if(person?.dept!=='depannage')return '';
 const verified=normalizeVisual(person.verifiedFunction);
 if(['leiding','awv','anwv','agentschap_wegen_en_verkeer'].includes(verified))return 'awv';
 if(['fast','f_a_s_t'].includes(verified))return 'fast';
 if(['lsra','lrsa'].includes(verified))return 'lsra';
 const call=String(person.call||'').trim().toUpperCase().replace(/\s+/g,'');
 if(/^(?:AWV|ANWV)(?:[-_0-9*]|$)/.test(call))return 'awv';
 if(/^(?:FAST|F\.A\.S\.T\.?)(?:[-_0-9*]|$)/.test(call))return 'fast';
 if(/^(?:LSRA|LRSA)(?:[-_0-9*]|$)/.test(call))return 'lsra';
 const rank=normalizeVisual(person.rank);
 if(['leiding','awv','anwv'].includes(rank)||rank.includes('agentschap_wegen'))return 'awv';
 if(['fast','f_a_s_t'].includes(rank))return 'fast';
 return 'lsra';
}
export function displaySelectors(person){
 const department=String(person?.dept||'');
 const result=[];
 if(department==='politie'){
  const call=policeCallSeries(person.call);
  if(call)result.push(['call',call]);
 }
 if(department==='ambulance'||department==='depannage'){
  const functionCode=department==='ambulance'?ambulanceFunction(person):depannageFunction(person);
  if(functionCode)result.push(['function',functionCode]);
 }
 if(department==='burger')result.push(['rank',citizenUniformRank(person)]);
 else if(person?.rank)result.push(['rank',normalizeVisual(person.rank)]);
 if(person?.tier)result.push(['cadre',normalizeVisual(person.tier)]);
 return result;
}
