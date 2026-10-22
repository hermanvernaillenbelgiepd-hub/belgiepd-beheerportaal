// BelgiumPD TEST: operationele roepnummerreeksen zijn leidend voor de
// verwachte rang, maar kennen zelf GEEN portaalrechten of promotie toe.
// 9xx is een kadergroep, geen uit het nummer afleidbare individuele graad.
export const POLICE_PROMOTION_RANKS=Object.freeze([
  'Agent',
  'Aspirant Inspecteur',
  'Inspecteur',
  'Eerste Inspecteur',
  'Aspirant Hoofdinspecteur',
  'Hoofdinspecteur',
  'Eerste Hoofdinspecteur'
]);

export const POLICE_CALL_BANDS=Object.freeze({
  1:Object.freeze({range:'1xx',code:'AP',label:'Agent van Politie',rank:'Agent',kader:'agentenkader'}),
  2:Object.freeze({range:'2xx',code:'AP',label:'Agent van Politie',rank:'Agent',kader:'agentenkader'}),
  3:Object.freeze({range:'3xx',code:'A-INP',label:'Aspirant Inspecteur van Politie',rank:'Aspirant Inspecteur',kader:'basiskader'}),
  4:Object.freeze({range:'4xx',code:'INP',label:'Inspecteur van Politie',rank:'Inspecteur',kader:'basiskader'}),
  5:Object.freeze({range:'5xx',code:'1-INP',label:'Eerste Inspecteur van Politie',rank:'Eerste Inspecteur',kader:'basiskader'}),
  6:Object.freeze({range:'6xx',code:'A-HINP',label:'Aspirant Hoofdinspecteur van Politie',rank:'Aspirant Hoofdinspecteur',kader:'middenkader'}),
  7:Object.freeze({range:'7xx',code:'HINP',label:'Hoofdinspecteur van Politie',rank:'Hoofdinspecteur',kader:'middenkader'}),
  8:Object.freeze({range:'8xx',code:'1-HINP',label:'Eerste Hoofdinspecteur van Politie',rank:'Eerste Hoofdinspecteur',kader:'middenkader'}),
  9:Object.freeze({range:'9xx',code:null,label:'Officierenkader / Korpsleiding',rank:null,kader:'officierenkader/korpsleiding'})
});

// Erkende vormen: 150, 188, S540, TEST-650. Een radiolabel zoals
// SANTO-930 wordt bewust NIET behandeld als personeelsroepnummer.
export function policeCallBand(value){
  const raw=String(value??'').trim();
  const match=/^(?:TEST[- ]?)?S?([1-9][0-9]{2})$/i.exec(raw);
  if(!match)return null;
  const band=POLICE_CALL_BANDS[Number(match[1][0])];
  return band?{...band,number:match[1]}:null;
}
