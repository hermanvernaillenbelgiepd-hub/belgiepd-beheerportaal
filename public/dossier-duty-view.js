// Dienstgebonden, alleen-lezen registratie; geen afgeleide maandmeting.
export const dutyDuration=n=>Number.isSafeInteger(n)&&n>=0?
 Math.floor(n/60)+' u '+String(n%60).padStart(2,'0')+' min':'Onbekend';
export const dutyClock=x=>{
 if(!x)return 'Onbekend';
 const d=new Date(x);
 return Number.isFinite(d.getTime())?d.toLocaleString('nl-BE',{timeZone:'Europe/Brussels',
  day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Onbekend';
};
export const serviceDutySummary=x=>{
 if(x?.status==='unmapped')return 'Geen ondubbelzinnige dienstcode: niet als nul uur te interpreteren.';
 if(x?.status==='no_records')return 'Geen individuele dienstregistraties in het API-antwoord.';
 if(x?.status!=='verified_service_shifts')return 'Diensturen niet beschikbaar.';
 return 'Diensturen '+dutyDuration(x.minutes)+' · '+x.shiftCount+' registraties'+
   (x.ongoingShifts?' · '+x.ongoingShifts+' lopend':'')+
   ' · laatste afgeronde dienst '+dutyClock(x.lastCompletedAt);
};
export function serviceMonthlyObservationText(preview){
 if(!preview||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(preview.month||'')))
  return 'Maandcontrole: nog geen betrouwbare maandgegevens.';
 const label=preview.month.slice(5,7)+'/'+preview.month.slice(0,4);
 if(preview.status!=='records_found')
  return label+': geen volledig afgesloten dienstregistratie teruggevonden. Dit bewijst geen 0 uur.';
 const recorded=dutyDuration(preview.recordedMinutes);
 const excluded=(preview.excludedBoundary||0)+(preview.excludedOngoing||0);
 return label+': '+recorded+' uit '+preview.completedShiftCount+
  ' volledig binnen deze maand afgesloten registraties'+
  (excluded?' · '+excluded+' overlopende/lopende diensten niet meegeteld':'')+
  ' · GEEN geverifieerd maandtotaal, niet gebruiken voor 50/50 of INACTIEF.';
}
export function renderServiceDutyDetails(root,data){
 root.replaceChildren();
 const monthly=document.createElement('p');monthly.className='subtle';
 monthly.textContent=serviceMonthlyObservationText(data?.monthlyPreview);
 monthly.setAttribute('data-month-evidence','informational-only');
 if(data?.status!=='verified_service_shifts'){
  root.textContent=serviceDutySummary(data);root.append(monthly);return;
 }
 root.append(monthly);
 for(const g of data.byService||[]){
  const p=document.createElement('p');p.className='subtle';
  p.textContent=(g.service||'Niet opgegeven')+' · '+dutyDuration(g.minutes);root.append(p);
 }
 const d=document.createElement('details'),summary=document.createElement('summary');
 summary.textContent='Individuele diensten ('+(data.shifts||[]).length+')';d.append(summary);
 for(const x of data.shifts||[]){
  const p=document.createElement('p');p.className='subtle';
  p.textContent=(x.service||'Niet opgegeven')+' · '+dutyDuration(x.minutes)+
   ' · '+dutyClock(x.startedAt)+' – '+(x.ongoing?'Lopend':dutyClock(x.endedAt));
  d.append(p);
 }
 root.append(d);
}
