// Read-only Police REEKS badges for the personnel roster and dossier header.
// These labels never assign a Discord role, rank, or dossier permission.
export const POLICE_SERIES_HEADS=Object.freeze({
  '1':Object.freeze([
    {name:'Brayan',id:'1041812771349737614'},
    {name:'Yassine',id:'622486684033875968'},
    {name:'Isaiah',id:'949115181785563137'},
    {name:'Mxxx_',id:'962410307463049236'}
  ]),
  '2':Object.freeze([
    {name:'Anvar',id:'729410384095871098'},
    {name:'Sir-robin',id:'305021081243090944'},
    {name:'Unemi',id:'298799630458552323'}
  ]),
  '3':Object.freeze([
    {name:'Jones',id:'1103170819355574328'},
    {name:'Roy',id:'1222286882331824208'},
    {name:'J.Eclaire',id:'344065695635734528'},
    {name:'Seba',id:'1171128215708909602'}
  ])
});
export const POLICE_SERIES_RELIEF=Object.freeze({name:'RX',id:'528568826481344522'});

export function rosterSeriesNumber(value){
  const raw=String(value??'').trim();
  const match=raw.match(/(?:^|\b)(?:reeks|serie|series)\s*0?([1-4])\b/i)||
    raw.match(/^0?([1-4])(?:\b|$)/);
  return match?Number(match[1]):null;
}
const roleForSeries=person=>{
  const fromDiscord=person?.discordCadre;
  if(fromDiscord==='Korpsleiding'||fromDiscord==='Officierenkader')
    return fromDiscord;
  const rank=String(person?.rank||'').toLocaleLowerCase('nl-BE');
  const call=String(person?.call||'').trim().match(/^(?:[a-z]{1,10}[- ])?(\d{3})$/i);
  const number=call?Number(call[1]):null;
  if(number===900||number===910||rank.includes('hoofdcommissaris')||
    rank.includes('eerste commissaris')&&number!==null&&number<920)
    return 'Korpsleiding';
  if(number!==null&&number>=920&&number<=999||rank.includes('commissaris'))
    return 'Officierenkader';
  return null;
};

export function policeRosterSeriesBadges(person,displayText){
  if(person?.dept!=='politie')return [];
  const raw=String(displayText??person.series??'').trim();
  const id=String(person.discordId||person.personId||'');
  const series=rosterSeriesNumber(person.series)||rosterSeriesNumber(raw);
  const badges=[];
  if(series){
    const heads=POLICE_SERIES_HEADS[String(series)]||[];
    badges.push({
      label:'Reeks '+series+(series===4?' · Reserve':''),
      type:'series-'+series,
      title:(heads.some(h=>h.id===id)?'Reekshoofd van reeks '+series+' · ':'')+
       (heads.length?'Reekshoofden: '+heads.map(h=>h.name).join(', '):
        series===4?'Reservereeks':'Reeks '+series)
    });
  }
  // Official rosters may show the collective value "Officierenkader /
  // Korpsleiding" for a 9xx callsign. Narrow it using the verified Discord
  // cadre (if present), then the existing visible rank/callsign.
  const cadre=roleForSeries(person);
  if(cadre==='Korpsleiding')
    badges.push({label:'👑',type:'corps',title:'Korpsleiding'});
  else if(cadre==='Officierenkader')
    badges.push({label:'🌈',type:'officer',title:'Officierenkader'});
  else if(/officierenkader/i.test(raw)&&/korpsleiding/i.test(raw))
    badges.push({label:'🌈 👑',type:'combined',
      title:'Niet verder onderscheiden in de beschikbare personeelsgegevens'});
  else if(/korpsleiding/i.test(raw))
    badges.push({label:'👑 Korpsleiding',type:'corps'});
  else if(/officierenkader/i.test(raw))
    badges.push({label:'🌈 Officierenkader',type:'officer'});
  if(/\bvlinder\b/i.test(raw)||id===POLICE_SERIES_RELIEF.id)
    badges.push({label:'🦋 Vlinder',type:'butterfly'});
  // Operational cadre is shown once by the table's group divider, not in
  // every individual row. Series-head information is kept in the tooltip.
  if(!badges.length&&/\b(?:middenkader|basiskader|agentenkader)\b/i.test(raw))
    return [];
  if(!badges.length)badges.push({label:raw||'—',type:'neutral'});
  return badges;
}
export function renderPoliceRosterSeries(root,person,displayText){
  root.replaceChildren();
  const wrap=document.createElement('div');wrap.className='police-roster-series';
  for(const badge of policeRosterSeriesBadges(person,displayText)){
    const span=document.createElement('span');
    span.className='police-roster-badge '+badge.type;
    span.textContent=badge.label;
    if(badge.title)span.title=badge.title;
    wrap.append(span);
  }
  root.append(wrap);
}
