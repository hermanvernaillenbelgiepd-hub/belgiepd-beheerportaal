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

/**
 * A native accessible disclosure. The compact line contains only date/title and
 * score; full factual text and attribution are never abbreviated or trimmed.
 * Returns content separately so existing authorised administrative actions may
 * be placed inside the expanded area without changing their permissions.
 */
export function createObservationDisclosure({title,score,details,attribution}={}){
  const element=document.createElement('details');
  element.className='bpd-observation-entry bpd-observation-disclosure';
  const summary=document.createElement('summary');
  summary.className='bpd-observation-summary';
  summary.append(createObservationHeader(title||'Observatie',score));
  const teaser=document.createElement('small');
  teaser.className='bpd-observation-shortline';
  teaser.textContent=String(details??'').replace(/\s+/g,' ').trim().slice(0,108)||
    'Geen omschrijving';
  if(String(details??'').replace(/\s+/g,' ').trim().length>108)teaser.textContent+='…';
  summary.append(teaser);
  const content=document.createElement('div');
  content.className='bpd-observation-content';
  const body=document.createElement('p');
  body.className='bpd-observation-body';
  body.textContent=String(details??'')||'Geen omschrijving';
  const author=document.createElement('small');
  author.className='bpd-observation-meta';
  author.textContent=String(attribution??'');
  content.append(body,author);
  element.append(summary,content);
  return {element,content};
}
