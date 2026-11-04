// Shared dossier status presentation; does not modify personnel records or permissions.
const statusMap=Object.freeze({
 'ACTIEF':['success','●'],'VERLOF':['leave','☀'],
 'INACTIEF':['inactive','●'],'50/50':['attention','◐'],
 'NON-ACTIEF':['nonactive','◌'],'VERWIJDERD':['removed','✕'],
 'ONTSLAG':['removed','↗'],'GESCHORST':['danger','⛔'],
 'BLACKLISTED':['removed','⛔'],'STAGE':['pending','◷'],
 'AANGEMELD':['pending','✓'],'RESTRICTED':['attention','⚠'],
 'OPLEIDING!':['attention','!'],'PLAVA':['lead','◆'],
 'GPC':['lead','◆'],'LEIDING':['lead','★'],
 'INSTRUCTEUR':['lead','★'],'DOCENT':['lead','★'],
 'MUG-HELI':['success','✚'],'SPECIALISATIE':['lead','◆']
});
export function dossierStatusPresentation(value,{leave=false}={}){
 const label=leave?'Verlof':String(value??'').trim()||'Onbekend';
 const key=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/[_\s-]+/g,' ').trim();
 const normalized=key==='NON ACTIEF'?'NON-ACTIEF':key;
 const info=statusMap[normalized]||['unknown','◇'];
 return {label,kind:info[0],icon:info[1]};
}
export function renderDossierStatus(element,value,options={}){
 if(!element)return;
 const state=dossierStatusPresentation(value,options);
 const pill=document.createElement('span');pill.className='bpd-dossier-status-pill';
 pill.dataset.tone=state.kind;
 const icon=document.createElement('span');icon.className='bpd-dossier-status-icon';
 icon.setAttribute('aria-hidden','true');icon.textContent=state.icon;
 const text=document.createElement('span');text.className='bpd-dossier-status-label';
 text.textContent=state.label;
 pill.append(icon,text);element.replaceChildren(pill);
 element.setAttribute('aria-label','Personeelsstatus: '+state.label);
}
