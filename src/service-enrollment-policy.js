// A newly joining member starts with a permanent Police identity before
// registration in another service. No Discord-role or unsourced display
// entry is sufficient proof.
const discordId=/^\d{15,22}$/;
export function verifiedFixedPoliceRosterMember(records,id){
 if(!discordId.test(String(id||''))||!Array.isArray(records))return null;
 const matches=records.filter(p=>p?.dept==='politie'&&p.personId===id&&
  !['archived','pending'].includes(p.lifecycleState));
 if(matches.length!==1)return null;
 const call=String(matches[0].call||'').trim();
 const number=/^(?:[A-Za-z]{1,12}[- ]?)?(\d{3})$/.exec(call)?.[1];
 if(!number)return null;
 const numeric=Number(number);
 if(numeric<200||numeric>999)return null; // 1xx temporary, 008 technical
 return matches[0];
}
export function checkServiceEnrollment(records,dept,id){
 if(dept==='politie')return {allowed:true};
 if(!['brandweer','ambulance','depannage'].includes(dept))
  return {allowed:false,reason:'Onbekende hulpdienst'};
 if(!verifiedFixedPoliceRosterMember(records,id))
  return {allowed:false,reason:'Een vast politieroepnummer is verplicht voor een inschrijving bij een andere hulpdienst. Vraag eerst je vaste roepnummer aan en laat het toekennen.'};
 return {allowed:true};
}
