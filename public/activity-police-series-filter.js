// A police series is a filter for presentation, never an access grant.
export function activityPoliceSeries(value){
 const text=String(value??'').trim();
 const match=/^(?:reeks\s*|r\s*)?0?([1-3])$/i.exec(text);
 return match?match[1]:'';
}
export function matchesActivityPoliceSeries(person,selected){
 if(!selected)return true;
 if(!['1','2','3'].includes(String(selected)))return false;
 return person?.department==='politie'&&activityPoliceSeries(person.series)===selected;
}
export function availableActivityPoliceSeries(records,department=''){
 if(department&&department!=='politie')return [];
 return ['1','2','3'].filter(series=>(Array.isArray(records)?records:[])
  .some(person=>matchesActivityPoliceSeries(person,series)));
}
