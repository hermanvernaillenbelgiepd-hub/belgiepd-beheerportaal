// Trusted read-only interpretation of historical RECORDS reset snapshots.
// These are not calendar-month telemetry and must never generate pings or status edits.
import {belgianDate} from './activity-center-model.js';

const ID=/^\d{15,22}$/;
const value=v=>String(v??'').trim();
const number=v=>{
 const s=value(v).replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const n=Number(s);
 return Number.isFinite(n)&&n<=1000000?n:null;
};

export function parseHistoricalRecords(rows){
 const input=Array.isArray(rows)?rows:[];
 const header=Array.isArray(input[0])?input[0]:[];
 const seenDates=new Set();
 const columns=[];
 for(let i=10;i<Math.min(header.length,23);i++){
  const date=belgianDate(value(header[i]));
  if(!date||seenDates.has(date))continue;
  seenDates.add(date);columns.push({column:i,date});
 }
 columns.sort((a,b)=>a.date.localeCompare(b.date));
 const items=new Map(),duplicates=new Set();
 for(const row of input.slice(1)){
  if(!Array.isArray(row))continue;
  // RECORDS B:D is the roster side; H:J is the snapshot side.
  // Both IDs must agree, or we cannot safely attribute private playtime.
  const left=value(row[3]),right=value(row[7]);
  if(!ID.test(right)||left!==right)continue;
  if(items.has(right)){items.delete(right);duplicates.add(right);continue}
  if(duplicates.has(right))continue;
  const snapshots=columns.flatMap(({column,date})=>{
   const hours=number(row[column]);
   return hours===null?[]:[{date,hours}];
  });
  items.set(right,snapshots);
 }
 return {items,dates:columns.map(x=>x.date),duplicates:duplicates.size};
}
