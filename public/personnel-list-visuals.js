// Shared presentation helpers for the two authorized personnel lists.
// Images are locally themed displays of documented Belgian police grades,
// NOT access privileges, rank grants, or real police identification.
(function(root){
  'use strict';
  const rankRows=[
    ['1HCP','Eerste hoofdcommissaris van politie','1HCP LP.svg',/^(?:1HCP|EERSTE\s+HOOFDCOMMISSARIS)/],
    ['HCP','Hoofdcommissaris van politie','HCP LP.svg',/^(?:HCP|HOOFDCOMMISSARIS)/],
    ['1CP','Eerste commissaris van politie','1CP LP.svg',/^(?:1CP|EERSTE\s+COMMISSARIS)/],
    ['ACP','Aspirant-commissaris van politie','ACP LP.svg',/^(?:ACP|ASPIRANT[ -]?COMMISSARIS)/],
    ['CP','Commissaris van politie','CP LP.svg',/^(?:CP|COMMISSARIS)/],
    ['1HINP','Eerste hoofdinspecteur van politie','1HINP LP.svg',/^(?:1HINP|EERSTE\s+HOOFDINSPECTEUR)/],
    ['AHINP','Aspirant-hoofdinspecteur van politie','AHINP LP.svg',/^(?:AHINP|ASPIRANT[ -]?HOOFDINSPECTEUR)/],
    ['HINP','Hoofdinspecteur van politie','HINP LP.svg',/^(?:HINP|HOOFDINSPECTEUR)/],
    ['1INP','Eerste inspecteur van politie','1INP LP.svg',/^(?:1INP|EERSTE\s+INSPECTEUR)/],
    ['AINP','Aspirant-inspecteur van politie','AINP LP.svg',/^(?:AINP|A[ -]?INP|ASPIRANT[ -]?INSPECTEUR)/],
    ['INP','Inspecteur van politie','INP LP.svg',/^(?:INP|INSPECTEUR)/],
    ['1AP','Eerste agent van politie','1AP LP.svg',/^(?:1AP|1AGP|EERSTE\s+AGENT)/],
    ['AAP','Aspirant-agent van politie','AAP LP.svg',/^(?:AAP|AAGP|ASPIRANT[ -]?AGENT)/],
    ['AP','Agent van politie','AP LP.svg',/^(?:AP|AGP|AGENT)/]
  ];
  const imgRoot='https://commons.wikimedia.org/wiki/Special:FilePath/';
  function rankInfo(raw,dept){
    const value=String(raw||'').trim().slice(0,90);
    if(dept!=='politie')return {label:value||'Niet ingevuld',image:null,code:null};
    const norm=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
      .replace(/[().]/g,' ').replace(/\s+/g,' ').trim();
    const row=rankRows.find(r=>r[3].test(norm));
    return row?{label:row[1],image:imgRoot+encodeURIComponent(row[2]),code:row[0]}:
      {label:value||'Rang onbekend',image:null,code:null};
  }
  const noStatus=/^(?:|NEE|NVT|N\.V\.T\.|NIET INGEVULD|NIET BEHAALD|GEEN|NEEN|NO|0|FALSE|-|—|ONBEKEND|NIET VAN TOEPASSING)$/i;
  const specialtyCatalog=[
    [/\b(MOTARD|MOTOR)\b/i,'🏍️'],
    [/\b(K9|HONDEN|HONDENGE)\b/i,'🐕'],
    [/\bRAGO\b/i,'🚁'],
    [/(RADIO|ASTRID)/i,'📻'],
    [/(DISPATCH|MELDKAMER)/i,'🎧'],
    [/(SIGNALISATIE)/i,'🦺'],
    [/(SIV|WPR|VERKEER)/i,'🚓'],
    [/(TO|TERREIN.?ONDERSTEUN)/i,'🛡️'],
    [/(AE|ARREST)/i,'🔒'],
    [/(HELI|MUGHELI)/i,'🚁'],
    [/(MIP|MEDICATIE|MEDISCH|VERPLEEG)/i,'🩺'],
    [/(LADDER)/i,'🪜'],
    [/(DUIK|BOOT|RED TEAM)/i,'🛟'],
    [/(BOSBESTRIJD|GEVAARLIJKE STOFFEN)/i,'🚒'],
    [/(LOGISTIEK|FAST|DEP2K|DEPANN)/i,'🛠️'],
    [/(BASIS TR|OPLEIDING|INSTRUCTEUR)/i,'🎓']
  ];
  // Central image registry: replace the emoji only for the exact requested skill.
  // Keep an emoji fallback if the asset fails to load.
  function specialtyIconImage(label,dept){
    const normalized=String(label||'').trim();
    if(/^motards?$/i.test(normalized)||(/^motor$/i.test(normalized)&&dept==='politie'))return '/assets/icons/motard.svg';
    if(/^semi[\s._-]*(?:ano\.?|anonieme?)$/i.test(normalized)&&(!dept||dept==='politie'))return '/assets/icons/semi-anonieme.svg';
    if(/^radio\s+bm$/i.test(normalized))return '/assets/icons/radio-bm.svg';
    if(/^signalisatie$/i.test(normalized))return '/assets/icons/signalisatie.svg';
    if(/^(?:SIV(?:\s*\/\s*WPR)?|WPR)$/i.test(normalized))return '/assets/icons/siv-wpr.svg';
    return null;
  }
  function specialtyIcon(label){
    return specialtyCatalog.find(([pattern])=>pattern.test(String(label||'')))?.[1]||'🏷️';
  }
  function qualification(value){
    return !noStatus.test(String(value??'').trim());
  }
  function specialtyBadges(stored,fallback){
    let list=Array.isArray(stored)?stored
      .filter(x=>x&&typeof x.label==='string'&&qualification(x.value))
      .map(x=>({label:x.label.trim(),value:String(x.value??'').trim()})):[];
    if(!list.length&&typeof fallback==='string'&&!/geen geregistreerde specialisaties/i.test(fallback)){
      list=fallback.split(' · ').filter(Boolean).slice(0,12).map(s=>{
        const index=s.indexOf(':');
        return {label:(index<0?s:s.slice(0,index)).trim(),
          value:index<0?'':s.slice(index+1).trim()};
      });
    }
    const seen=new Set();
    return list.filter(x=>{
      const key=x.label.toLocaleLowerCase('nl-BE');
      if(!key||seen.has(key))return false;
      seen.add(key);return true;
    }).slice(0,16).map(x=>({label:x.label,value:x.value,icon:specialtyIcon(x.label)}));
  }
  // Full administrative status strip: unlike the compact success-only icons,
  // this ALWAYS includes Nee, Stage, Ja, Docent and unknown source values.
  function specialtyStatuses(stored){
    if(!Array.isArray(stored))return [];
    const seen=new Set(),out=[];
    for(const item of stored.slice(0,20)){
      if(!item||typeof item.label!=='string')continue;
      const label=item.label.trim().slice(0,64);
      const key=label.toLocaleLowerCase('nl-BE');
      if(!key||seen.has(key))continue;
      seen.add(key);
      const raw=typeof item.value==='string'?item.value.trim():'';
      const lower=raw.toLocaleLowerCase('nl-BE');
      const status=lower==='ja'?'Ja':lower==='nee'||lower==='neen'?'Nee':
        lower==='stage'?'Stage':lower==='docent'?'Docent':
        raw||'Niet ingevuld';
      const style=status==='Ja'?'yes':status==='Nee'?'no':
        status==='Stage'?'stage':status==='Docent'?'teacher':'unknown';
      out.push({label,status,style,icon:specialtyIcon(label)});
    }
    return out;
  }
  // Display one status column per service-specific specialization.
  // For combined services, the caller displays a compact summary instead.
  const labelsByService=Object.freeze({
    politie:['Radio BM','SIV/WPR','Signalisatie','Motor','Semi-ano.','K9','RAGO','Dispatch','TO','AE'],
    ambulance:['Basis TR','Medicatie','HELI','Motor','MIP'],
    brandweer:['Basis TR','Logistiek','Ladderwagen','Duiker','Signalisatie','RED team','Gevaarlijke stoffen','Grote Boot'],
    depannage:['Opleiding DEP2K','Opleiding FAST']
  });
  function specialtyColumns(dept){
    return labelsByService[dept]?[...labelsByService[dept]]:[];
  }
  function specialtyStateFor(person,label){
    return specialtyStatuses(person?.specialties).find(x=>x.label===label)||
      {label,status:'Niet ingevuld',style:'unknown',icon:specialtyIcon(label)};
  }
  root.BPDPersonnelVisuals=Object.freeze({
    rankInfo,specialtyBadges,specialtyIcon,specialtyIconImage,qualification,specialtyStatuses,
    specialtyColumns,specialtyStateFor
  });
})(typeof window==='object'?window:globalThis);
