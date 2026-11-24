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
export function renderServiceDutyDetails(root,data){
 root.replaceChildren();
 if(data?.status!=='verified_service_shifts'){root.textContent=serviceDutySummary(data);return}
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
