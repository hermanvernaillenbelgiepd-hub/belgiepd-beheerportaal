// Presentation-only operational grouping for the Police personnel list.
// Kader is derived from the roster's call range and verified Discord cadre.
const tiers=Object.freeze({
 korpsleiding:{order:0,label:'👑 KORPSLEIDING'},
 officierenkader:{order:1,label:'🌈 OFFICIERENKADER'},
 middenkader:{order:2,label:'MIDDENKADER'},
 basiskader:{order:3,label:'BASISKADER'},
 agentenkader:{order:4,label:'AGENTENKADER'},
 overig:{order:5,label:'OVERIGE / BESTUUR'},
 zonderPolitie:{order:6,label:'NOG GEEN POLITIE-INSCHRIJVING'}
});
const callNumber=call=>{
 const match=String(call??'').trim().match(/^(?:[a-z]{1,12}[- ]?)?(\d{1,4})$/i);
 return match?Number(match[1]):null;
};
export function policeOperationalTier(person){
 if(person?.dept!=='politie')return null;
 if(person?.hasPoliceEntry===false)return 'zonderPolitie';
 if(person?.discordCadre==='Korpsleiding')return 'korpsleiding';
 if(person?.discordCadre==='Officierenkader')return 'officierenkader';
 const call=callNumber(person.call);
 if(call===8)return 'overig';
 if(call===900||call===910)return 'korpsleiding';
 if(call!==null&&call>=920&&call<=999)return 'officierenkader';
 if(call!==null&&call>=600&&call<=899)return 'middenkader';
 if(call!==null&&call>=300&&call<=599)return 'basiskader';
 if(call!==null&&call>=100&&call<=299)return 'agentenkader';
 const rank=String(person.rank??'').toLowerCase();
 if(rank.includes('hoofdcommissaris'))return 'korpsleiding';
 if(rank.includes('commissaris'))return 'officierenkader';
 if(rank.includes('hoofdinspecteur'))return 'middenkader';
 if(rank.includes('inspecteur'))return 'basiskader';
 if(rank.includes('agent'))return 'agentenkader';
 return 'overig';
}
export function policeTierDisplay(tier){
 return tiers[tier]||tiers.overig;
}
export function policeGroupedRoster(rows){
 const list=Array.isArray(rows)?rows:[];
 const buckets=new Map();
 for(const p of list){
   const key=policeOperationalTier(p);
   if(!key)continue;
   if(!buckets.has(key))buckets.set(key,[]);
   buckets.get(key).push(p);
 }
 return [...buckets].sort((a,b)=>policeTierDisplay(a[0]).order-
  policeTierDisplay(b[0]).order);
}
