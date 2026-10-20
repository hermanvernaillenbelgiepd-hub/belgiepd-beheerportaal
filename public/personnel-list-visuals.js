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
    [/(RADIO|RAGO|ASTRID)/i,'📻'],
    [/(DISPATCH|MELDKAMER)/i,'🎧'],
    [/(SIGNALISATIE)/i,'🚦'],
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
  root.BPDPersonnelVisuals=Object.freeze({rankInfo,specialtyBadges,specialtyIcon,qualification});
})(typeof window==='object'?window:globalThis);
