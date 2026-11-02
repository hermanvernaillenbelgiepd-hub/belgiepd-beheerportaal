// Unified, service-local personnel specialization controls. No direct Firebase
// writes or client-side authorization decisions; every action uses guarded APIs.
(function(){
'use strict';
const levels=['Nee','Stage','AANGEMELD','Ja','INSTRUCTEUR','LEIDING','RESTRICTED',
 'Docent','Niet ingevuld','OPLEIDING!','PLAVA','GPC','INACTIEF','SPECIALISATIE',
 'MUG-HELI','GESCHORST','ONTSLAG','BLACKLISTED'];
const titles={'Motor':'MOTARD','Dispatch':'DISP','Radio BM':'RADIO/BM',
 'Semi-ano.':'SEMI-ANONIEM','SIV/WPR':'SIV / WPR'};
const statuses={
 AE:{Stage:'AE-I · in opleiding',Ja:'AE-T · volwaardig',
   LEIDING:'TEAMLEADER / LEIDING',INSTRUCTEUR:'AE-INSTRUCTEUR'},
 Motor:{Stage:'MOTARD · in opleiding',Ja:'MOTARD · volwaardig',
   INSTRUCTEUR:'MOTARD · instructeur'},
 Dispatch:{Stage:'DISPATCH SELECTIE',Ja:'DISP · volwaardig',
   INSTRUCTEUR:'DISP · instructeur'},
 K9:{Stage:'GELEIDER IN STAGE',Ja:'GELEIDER',INSTRUCTEUR:'K9 · instructeur'},
 RAGO:{AANGEMELD:'RAGO · in opleiding',Ja:'RAGO · volwaardig',
   INSTRUCTEUR:'RAGO · instructeur'}
};
const E=(tag,cls,text)=>{
 const item=document.createElement(tag);
 if(cls)item.className=cls;
 if(text!==undefined)item.textContent=text;
 return item;
};
const display=label=>titles[label]||label;
const dateToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
 year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function field(parent,title,type,opts={}){
 const wrapper=E('label');
 wrapper.append(E('span','',title));
 const input=E(type==='textarea'?'textarea':type==='select'?'select':'input');
 if(type!=='textarea'&&type!=='select')input.type=type;
 if(opts.required)input.required=true;
 if(opts.maxLength)input.maxLength=opts.maxLength;
 if(opts.min)input.min=opts.min;
 if(opts.value!==undefined)input.value=opts.value;
 wrapper.append(input);parent.append(wrapper);
 return input;
}
function feedback(node,msg,error=false){
 node.textContent=msg;node.style.color=error?'#ffb0ba':'#bdd7ef';
}
async function submit({request,refresh,base,button,payload,msg,output,notify}){
 button.disabled=true;
 try{
  await request(base,{method:'POST',body:payload});
  feedback(output,msg);
  if(notify)notify(msg);
  await refresh();
 }catch(e){feedback(output,'Niet opgeslagen: '+e.message,true)}
 finally{button.disabled=false}
}
function render({target,history,status,items,data,canEdit,person,request,refresh,notify,revision}){
 target.replaceChildren();history.replaceChildren();
 const canRestrict=data?.canRestrict===true&&!data.error;
 const restrictions=Array.isArray(data.entries)?data.entries:[];
 const api='/api/personnel/'+encodeURIComponent(person.dept)+'/'+
  encodeURIComponent(person.discordId);
 feedback(status,data.error?'Beperkingen tijdelijk niet beschikbaar: '+data.error:
  'Klik op een specialisatie om de status en tijdelijke beperkingen te bekijken.'+
  (canEdit||canRestrict?' Handmatige wijzigingen worden gelogd; Discord-rechten blijven ongewijzigd.':' Alleen lezen.'));
 const historyRows=Array.isArray(data.history)?data.history:[];
 if(!historyRows.length)history.textContent='Nog geen beperkingen geregistreerd.';
 for(const a of historyRows){
  const row=E('div','history');
  row.append(E('strong','',display(a.label)+' · '+(a.action==='lift'?'Ingetrokken':'Ingesteld')+
    ' · '+(a.at?new Date(a.at).toLocaleString('nl-BE'):'tijdstip onbekend')));
  row.append(E('p','',a.reason+' · door '+(a.by||'onbekend')));
  history.append(row);
 }
 for(const item of items){
  if(!item||typeof item.label!=='string')continue;
  const current=restrictions.filter(x=>x.label===item.label);
  const ongoing=current.find(x=>x.status==='actief'||x.status==='gepland');
  const row=E('details','unified-row');
  const summary=E('summary');
  summary.append(E('strong','',display(item.label)));
  const note=E('span','unified-status'+(ongoing?' unified-limited':''),
   item.value+(ongoing?' · BEPERKT T/M '+ongoing.endDate:''));
  summary.append(note);row.append(summary);
  if(ongoing){
   const desc=E('p','subtle','Tijdelijke beperking: '+ongoing.startDate+' t.e.m. '+ongoing.endDate+
    ' · '+(ongoing.status==='gepland'?'gepland':'actief'));
   row.append(desc);
  }
  if(current.length){
   const all=E('p','subtle',current.map(x=>
    (x.status==='actief'?'Actief':x.status==='gepland'?'Gepland':
      x.status==='verlopen'?'Verlopen':'Ingetrokken')+
    ' ('+x.startDate+' – '+x.endDate+')').join(' · '));
   row.append(all);
  }
  if(!canEdit&&!canRestrict){
   row.append(E('p','subtle','Alleen-lezen. Wijzigingen vereisen de juiste dienstbevoegdheid.'));
   target.append(row);continue;
  }
  if(canEdit&&item.readOnly!==true){
   const form=E('form','unified-fields');
   const state=field(form,'Specialisatiestatus','select',{required:true});
   const values=[...new Set([...levels,item.value])].filter(Boolean);
   for(const value of values){
    const label=(statuses[item.label]||{})[value]||value;
    const opt=E('option','',label);opt.value=value;state.append(opt);
   }
   state.value=item.value;
   const reason=field(form,'Motivering wijziging (min. 15 tekens)','textarea',{required:true,maxLength:500});
   reason.minLength=15;reason.rows=2;reason.placeholder='Waarom verandert deze specialisatiestatus?';
   const btn=E('button','alt','Status bewaren');btn.type='submit';
   const out=E('p','subtle unified-wide');
   form.append(btn,out);
   form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(state.value===item.value)return feedback(out,'De status is ongewijzigd.',true);
    if(!form.reportValidity())return;
    if(!confirm('Specialisatie '+display(item.label)+' van '+person.name+
      ' wijzigen naar '+state.value+'?'))return;
    await submit({request,refresh,base:api+'/specializations',button:btn,
      payload:{label:item.label,value:state.value,reason:reason.value.trim(),
       expectedRevision:revision},
      msg:'Specialisatiestatus opgeslagen en geaudit.',output:out,notify});
   });
   row.append(form);
  }
  if(canRestrict&&item.readOnly!==true){
   const form=E('form','unified-fields');
   const action=ongoing?'lift':'restrict';
   const dates=action==='restrict';
   let start,end;
   if(dates){
    start=field(form,'Begindatum tijdelijke beperking','date',
      {value:dateToday(),required:true});
    end=field(form,'Tot en met (einddatum)','date',
      {min:dateToday(),required:true});
    start.onchange=()=>{end.min=start.value;if(end.value&&end.value<start.value)end.value=''};
   }
   const reason=field(form,action==='lift'?
    'Reden om beperking in te trekken':'Motivering tijdelijke beperking',
    'textarea',{required:true,maxLength:500});
   reason.rows=2;reason.minLength=15;
   const button=E('button','alt',action==='lift'?'Beperking intrekken':'Tijdelijk beperken');
   button.type='submit';const out=E('p','subtle unified-wide');
   form.append(button,out);
   form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(!form.reportValidity())return;
    const payload={action,label:item.label,reason:reason.value.trim(),
      expectedRevision:data.revision};
    if(dates){
     payload.startDate=start.value;payload.endDate=end.value;
     if(payload.endDate<payload.startDate)
      return feedback(out,'Einddatum mag niet vóór begindatum liggen.',true);
    }
    if(!confirm((dates?'Tijdelijke beperking instellen op ':'Beperking intrekken voor ')+
      display(item.label)+' bij '+person.name+'?'))return;
    await submit({request,refresh,base:api+'/specialty-restrictions',button,payload,
      msg:dates?'Beperking geregistreerd in dossier en weekrapport.':'Beperking met audit ingetrokken.',
      output:out,notify});
   });
   row.append(form);
  }
  target.append(row);
 }
 if(!items.length)target.textContent='Geen geregistreerde specialisaties in dit dienstdossier.';
}
window.BPDSpecialtyDossierControls=Object.freeze({render});
})();
