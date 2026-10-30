// Presentation-only uniform grouping; never alters operational ranks or access.
// Stable names are used for explicitly configurable image assignment rules.
export const POLICE_UNIFORM_GROUPS=Object.freeze([
 {code:'basis_tm_ahinp',label:'Basisuniform — Agent t.e.m. A-HINP'},
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
 ['ambulancier','Ambulancier (AMB / HAMB)'],
 ['vpk','Verpleegkundige (VPK / HVPK)'],
 ['arts','Arts (ARTS / HARTS)'],
 ['dirmed','DIRMED — functieopschrift']
]);
export function normalizeVisual(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
}
export function policeCallSeries(call){
 const raw=String(call||'').trim().toUpperCase();
 // Accept 400, SANTO-400 or SANTO 400; never infer rank from an ID.
 const match=/(?:^|[\s-])([1-9][0-9]{2})(?:$|\s|\*)/.exec(raw)||/^S([1-9][0-9]{2})(?:\*)?$/.exec(raw);
 if(!match)return '';
 const number=Number(match[1]);
 if(number<100||number>999)return '';
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
 if(series&&n>=100&&n<=600)return 'basis_tm_ahinp';
 if(series&&n>=700&&n<=800)return 'hinp_1hinp';
 if(series&&n>=900&&n<=930)return 'officieren';
 // For legacy records with no usable call, infer display group from a known rank.
 const rank=normalizeVisual(person.rank);
 if(['agent_van_politie','aspirant_inspecteur','inspecteur','eerste_inspecteur',
  'aspirant_hoofdinspecteur','a_hinp'].includes(rank))return 'basis_tm_ahinp';
 if(['hoofdinspecteur','eerste_hoofdinspecteur'].includes(rank))return 'hinp_1hinp';
 if(['aspirant_commissaris','commissaris','eerste_commissaris',
  'eerste_hoofdcommissaris'].includes(rank))return 'officieren';
 return '';
}
export function ambulanceFunction(person){
 if(person?.dept!=='ambulance')return '';
 const raw=String(person.call||'').trim().toUpperCase().replace(/\s+/g,'');
 const prefix=/^(DIRMED|HARTS|HVPK|HAMB|ARTS|VPK|AMB)(?:[-_0-9*]|$)/.exec(raw)?.[1];
 if(prefix==='DIRMED')return 'dirmed';
 if(['HARTS','ARTS'].includes(prefix))return 'arts';
 if(['HVPK','VPK'].includes(prefix))return 'vpk';
 if(['HAMB','AMB'].includes(prefix))return 'ambulancier';
 const rank=normalizeVisual(person.rank);
 if(rank==='dirmed'||rank==='dir_med'||rank.includes('directeur_medisch'))return 'dirmed';
 if(rank.includes('verpleegkundige')||rank==='vpk'||rank==='hvpk')return 'vpk';
 if(rank==='arts'||rank==='harts'||rank.includes('_arts'))return 'arts';
 if(rank==='ambulancier'||rank==='ambulance'||rank==='amb'||rank==='hamb')return 'ambulancier';
 return '';
}
export function displaySelectors(person){
 const department=String(person?.dept||'');
 const result=[];
 if(department==='politie'){
  const call=policeCallSeries(person.call);
  if(call)result.push(['call',call]);
 }
 if(department==='ambulance'){
  const functionCode=ambulanceFunction(person);
  if(functionCode)result.push(['function',functionCode]);
 }
 if(person?.rank)result.push(['rank',normalizeVisual(person.rank)]);
 if(person?.tier)result.push(['cadre',normalizeVisual(person.tier)]);
 return result;
}
