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
  function specialtyIconImage(label){
    return /^signalisatie$/i.test(String(label||'').trim())
      ?'/assets/icons/signalisatie.svg':null;
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
      const kind=status.toLocaleUpperCase('nl-BE');
      const style=['ACTIEF','JA'].includes(kind)?'yes':
        ['INACTIEF'].includes(kind)?'inactive':
        kind==='BLACKLISTED'?'blacklisted':
        kind==='ONTSLAG'?'resigned':
        ['STAGE','AANGEMELD'].includes(kind)?'stage':
        ['RESTRICTED','OPLEIDING!','WAARSCHUWING'].includes(kind)?'warning':
        ['PLAVA','GPC','LEIDING','SPECIALISATIE','INSTRUCTEUR','DOCENT'].includes(kind)?'lead':
        kind==='MUG-HELI'?'lightgreen':
        kind==='NEE'?'no':'unknown';
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
    depannage:['Opleiding DEP2K','Opleiding FAST','CRANE','WEGENWERKEN']
  });
  function specialtyColumns(dept){
    return labelsByService[dept]?[...labelsByService[dept]]:[];
  }
  function specialtyStateFor(person,label){
    return specialtyStatuses(person?.specialties).find(x=>x.label===label)||
      {label,status:'Niet ingevuld',style:'unknown',icon:specialtyIcon(label)};
  }
  // Informatieve kaderindeling op basis van de personeelsfiche.
  // Discord-rollen en dossiermachtigingen worden hierdoor nooit gewijzigd.
  function policeCadre(person){
    if(person?.dept!=='politie')return null;
    const raw=String(person.call||'').trim();
    const match=raw.match(/^(?:[a-z]+[- ]?)?(\d{3})$/i);
    const number=match?Number(match[1]):null;
    if(number!==null && number>=100 && number<=299)return 'Agentenkader';
    // 9xx: het roepnummer identificeert de groep; de geverifieerde Discord-rol
    // onderscheidt officierenkader en korpsleiding, zonder rechten te wijzigen.
    if(number!==null && number>=900 && number<=999)
      return person.discordCadre==='Korpsleiding'||person.discordCadre==='Officierenkader'?
        person.discordCadre:'Officierenkader / Korpsleiding';
    const code=rankInfo(person.rank,'politie').code;
    if(['HCP','1HCP','CP','1CP'].includes(code))return 'Korpsleiding';
    if(code==='ACP')return 'Officierenkader';
    if(['HINP','1HINP','AHINP'].includes(code))return 'Middenkader';
    if(['INP','1INP','AINP'].includes(code))return 'Basiskader';
    if(number!==null && number>=300 && number<=999)return 'Basiskader';
    if(['AP','1AP','AAP'].includes(code))return null;
    return null;
  }
  function seriesWithCadre(person,series){
    const current=String(series||'').trim(),cadre=policeCadre(person);
    if(!cadre)return current||'—';
    if(current===cadre)return current;
    if(!current||current==='Niet ingevuld'||current==='—'||current==='Kader')return cadre;
    return current+' · '+cadre;
  }
  // Sorteer numeriek op CALL, niet op de toevallige Sheets/Firestore-rijvolgorde.
  // Ook S300 en 008 worden als getallen gelezen; het speciale 008 staat onderaan.
  const callNumber=call=>{
    const value=String(call??'').trim();
    const match=value.match(/^(?:[A-Z]{1,12}[- ]?)?(\d{1,4})$/i);
    return match?Number(match[1]):null;
  };
  const reservedCall=call=>/^(?:[A-Z]{1,12}[- ]?)?008$/i.test(String(call??'').trim());
  // Dedicated ambulance order only; other emergency services retain
  // their existing personnel-list order and permissions.
  const ambulanceSortKey=person=>{
    const call=String(person?.call||'').trim().toUpperCase();
    const match=call.match(/^(DIRMED|HARTS|HVPK|HAMB|ARTS|VPK|AMB|STAG)(?:[- ]?(\d{1,4}))?$/);
    const order=['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB','STAG'];
    return {group:match?order.indexOf(match[1]):99,
      number:match?.[2]!==undefined?Number(match[2]):0};
  };
  // Brandweer sheet: ZONE, OFF-02..06, OOFF-08..15, BWM-01..25
  // (first corporals, then firefighters), STAG-01..21. Ascending numbers.
  const fireSortKey=person=>{
    const call=String(person?.call||'').trim().toUpperCase().replaceAll(' ','');
    if(['ZONE','ZONECOMMANDANT','ZONECOMMANDANTE'].includes(call))
      return {group:0,number:0};
    const match=call.match(/^(OOFF|OFF|BWM|BMW|STAG)-?(\d{1,4})$/);
    if(!match)return {group:6,number:999};
    const prefix=match[1],n=Number(match[2]);
    if(prefix==='OFF'&&n>=2&&n<=6)return {group:1,number:n};
    if(prefix==='OOFF'&&n>=8&&n<=15)return {group:2,number:n};
    if(['BWM','BMW'].includes(prefix)&&n>=1&&n<=5)return {group:3,number:n};
    if(['BWM','BMW'].includes(prefix)&&n>=6&&n<=25)return {group:4,number:n};
    if(prefix==='STAG'&&n>=1&&n<=21)return {group:5,number:n};
    return {group:6,number:999};
  };
  // Visual service grouping only; never evidence of Discord permissions.
  // Depannage specialties (DEP2K/FAST/CRANE/WEGENWERKEN) stay independent.
  const depannageFunction=person=>{
    const call=String(person?.call||'').trim().toUpperCase().replace(/\./g,'');
    const rank=String(person?.rank||'').trim().toUpperCase();
    const awv=/^(?:AWV|ANWV)(?:[- ]?\d{1,4})?$/.test(call)||
      /(?:AGENTSCHAP\s+WEGEN\s+(?:EN|&)\s+VERKEER|\bANWV\b|\bAWV\b)/.test(rank);
    const fast=/^FAST(?:[- ]?\d{1,4})?$/.test(call)||
      /\bF[.\s]*A[.\s]*S[.\s]*T\b|\bFAST\b/.test(rank);
    const lsra=/^LSRA(?:[- ]?\d{1,4})?$/.test(call)||/\bLSRA\b/.test(rank);
    // A recent authenticated Discord role is authoritative for this display.
    // On stale/missing snapshots, fall back to known function/callsign labels.
    const verified={leiding:0,fast:1,lsra:2}[person.verifiedFunction];
    const group=Number.isInteger(verified)?verified:awv?0:fast?1:lsra?2:3;
    const match=call.match(/(\d{1,4})$/);
    const names=['Agentschap Wegen en Verkeer','F.A.S.T','LSRA','Niet ingedeeld'];
    const headings=['LEIDING · Agentschap Wegen en Verkeer','F.A.S.T','LSRA','OVERIGE DEPANNAGE'];
    return {group,number:match?Number(match[1]):0,
      functionName:names[group],label:headings[group]};
  };
  function comparePersonnel(a,b,mode='call-desc'){
    const nameA=String(a?.name||''),nameB=String(b?.name||'');
    const nameCompare=nameA.localeCompare(nameB,'nl',{numeric:true,sensitivity:'base'});
    const fallback=()=>nameCompare||
      String(a?.dept||'').localeCompare(String(b?.dept||''),'nl')||
      String(a?.discordId||a?.personId||'').localeCompare(String(b?.discordId||b?.personId||''),'nl');
    if(mode==='ambulance'){
      const aa=ambulanceSortKey(a),bb=ambulanceSortKey(b);
      return aa.group-bb.group||aa.number-bb.number||fallback();
    }
    if(mode==='brandweer'){
      const aa=fireSortKey(a),bb=fireSortKey(b);
      return aa.group-bb.group||aa.number-bb.number||fallback();
    }
    if(mode==='depannage'){
      const aa=depannageFunction(a),bb=depannageFunction(b);
      return aa.group-bb.group||aa.number-bb.number||
        String(a?.call||'').localeCompare(String(b?.call||''),'nl',{numeric:true})||fallback();
    }
    // BelgiumPD: hoogste honderdreeks eerst, binnen die reeks oplopend.
    // Bijvoorbeeld 900, 910, 920, 930, daarna 800..., 700..., 600...
    // Bestuursnummer 008 blijft altijd onderaan.
    if(mode==='series-desc'){
      const aSpecial=reservedCall(a?.call),bSpecial=reservedCall(b?.call);
      if(aSpecial!==bSpecial)return aSpecial?1:-1;
      const aNum=callNumber(a?.call),bNum=callNumber(b?.call);
      if((aNum===null)!==(bNum===null))return aNum===null?1:-1;
      if(aNum!==null&&bNum!==null){
        const groupA=Math.floor(aNum/100),groupB=Math.floor(bNum/100);
        if(groupA!==groupB)return groupB-groupA;
        if(aNum!==bNum)return aNum-bNum;
      }
      return fallback();
    }
    if(mode==='name-asc'||mode==='name-desc')
      return (mode==='name-desc'?-nameCompare:nameCompare)||
        String(a?.call||'').localeCompare(String(b?.call||''),'nl',{numeric:true})||fallback();
    // Bestuursroepnummer 008 is een uitzondering en blijft altijd onderaan.
    const specialA=reservedCall(a?.call),specialB=reservedCall(b?.call);
    if(specialA!==specialB)return specialA?1:-1;
    const na=callNumber(a?.call),nb=callNumber(b?.call);
    if((na===null)!==(nb===null))return na===null?1:-1;
    if(na!==null&&nb!==null&&na!==nb)return mode==='call-asc'?na-nb:nb-na;
    const ca=String(a?.call||''),cb=String(b?.call||'');
    const alpha=ca.localeCompare(cb,'nl',{numeric:true,sensitivity:'base'});
    return (mode==='call-asc'?alpha:-alpha)||fallback();
  }
  function sortPersonnelRows(rows,mode='call-desc'){
    return [...rows].sort((a,b)=>comparePersonnel(a,b,mode));
  }
  root.BPDPersonnelVisuals=Object.freeze({
    rankInfo,specialtyBadges,specialtyIcon,specialtyIconImage,qualification,specialtyStatuses,
    specialtyColumns,specialtyStateFor,policeCadre,seriesWithCadre,depannageFunction,comparePersonnel,sortPersonnelRows
  });
})(typeof window==='object'?window:globalThis);
