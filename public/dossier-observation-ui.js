// Shared observation score component for Police, Fire, Ambulance, Towing and Citizen dossiers.
// UI only: score never implies a sanction, promotion or role change.
export function createObservationScoreBadge(raw){
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  const value=Number(raw);
  if(!Number.isInteger(value)||value<0||value>10)return null;
  const badge=document.createElement('span');
  badge.className='bpd-score-chip police-score-badge police-score-'+value;
  badge.textContent=value===0?'0 · DEGRADATIE':value+'/10';
  badge.setAttribute('aria-label',value===0?'Observatiescore 0 op 10: degradatie-aanduiding':
    'Observatiescore '+value+' op 10');
  badge.title=value===0?'Degradatie-aanduiding, geen automatische rangwijziging':
    'Observatiescore '+value+' op 10';
  return badge;
}
export function createObservationHeader(label,score){
  const header=document.createElement('div');
  header.className='bpd-observation-head';
  const heading=document.createElement('strong');
  heading.textContent=String(label||'Observatie');
  header.append(heading);
  const badge=createObservationScoreBadge(score);
  if(badge)header.append(badge);
  return header;
}
