// Presentational metadata for Police personnel dossiers.
// These decorations never confer ranks, departments or permissions.
export const scoreColors=Object.freeze([
 '#727987', // 0: degradatie is a visual warning, not an automatic promotion action
 '#991b1b','#bd2727','#dc4526','#ea6b20','#e79a13',
 '#d9b92e','#a3c849','#69bf54','#2f9950','#16783d'
]);
export function validObservationScore(raw){
 if(raw===null||raw===undefined||typeof raw==='boolean')return null;
 if(typeof raw==='string'&&!raw.trim())return null;
 const value=Number(raw);
 return Number.isInteger(value)&&value>=0&&value<=10?value:null;
}
export function scoreClass(raw){
 const score=validObservationScore(raw);
 return score===null?null:'police-score-'+score;
}
export function scoreLabel(raw){
 const score=validObservationScore(raw);
 return score===null?'Geen score':score===0?'0 · DEGRADATIE':String(score)+'/10';
}
export function observationSummary(entries,{limited=false}={}){
 const scores=(Array.isArray(entries)?entries:[])
  .filter(row=>row?.type==='observatie'&&row?.testRecord!==true&&
     !['ingetrokken','withdrawn'].includes(String(row.status||'').toLowerCase()))
  .map(row=>validObservationScore(row.score)).filter(x=>x!==null);
 const count=scores.length;
 return {count,average:count?scores.reduce((sum,n)=>sum+n,0)/count:null,
   limited:limited===true};
}
export function seriesNumber(series){
 const s=String(series??'').trim();
 const match=s.match(/^(?:(?:reeks|serie|series)\s*)?0?([1-4])(?:\s*\(?reserve\)?)?$/i);
 return match?Number(match[1]):null;
}
export function seriesClass(series){
 const value=seriesNumber(series);
 return value===null?'series-none':'police-series-'+value;
}
const policeCall=person=>{
 const match=String(person?.call||'').trim().match(/^(?:[a-z]{1,10}[- ])?([0-9]{3})$/i);
 return match?Number(match[1]):null;
};
export function policeDesignation(person){
 if(person?.dept!=='politie')return null;
 const rank=String(person.rank||'').toLocaleLowerCase('nl-BE');
 const call=policeCall(person);
 const series=String(person.series||'').toLowerCase();
 if(call!==null&&(call===900||call===910)||rank.includes('hoofdcommissaris')||
     rank.includes('eerste commissaris')&&call!==null&&call<920)
   return {icon:'👑',text:'Korpsleiding',kind:'corps'};
 if(call!==null&&call>=920&&call<=999||rank.includes('commissaris'))
   return {icon:'🌈',text:'Officierenkader',kind:'officer'};
 if(series.includes('vlinder')||String(person.discordId||'')==='528568826481344522')
   return {icon:'🦋',text:'Vlinder',kind:'butterfly'};
 return null;
}
