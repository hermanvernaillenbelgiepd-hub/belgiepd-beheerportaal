// Activiteitscentrum uses the exact police cadre hierarchy as the public
// personnel roster. This is presentation order only: no status/rank changes.
import {policeOperationalTier,policeTierDisplay} from './police-roster-cadre.js';

const DEPT_ORDER=Object.freeze({politie:0,brandweer:1,ambulance:2,depannage:3,burger:4});
const compareText=(a,b)=>String(a||'').localeCompare(String(b||''),'nl',{sensitivity:'base',numeric:true});
const callNumber=value=>{
 const m=/^(?:[a-z]{1,12}[- ]?)?(\d{1,4})$/i.exec(String(value||'').trim());
 return m?Number(m[1]):null;
};
export function activityRosterGroup(p){
 const dept=String(p?.department||'').toLowerCase();
 if(dept==='politie')return dept+':'+(policeOperationalTier({
   dept:'politie',call:p.call,rank:p.rank||'',discordCadre:p.discordCadre,
   hasPoliceEntry:true
 })||'overig');
 return dept;
}
export function activityRosterGroupLabel(p){
 const key=activityRosterGroup(p);
 const [dept,tier]=key.split(':');
 if(dept==='politie')return 'Politie · '+policeTierDisplay(tier).label;
 return dept==='brandweer'?'Brandweer':
  dept==='ambulance'?'Ambulance':dept==='depannage'?'Depannage':
  dept==='burger'?'Burger':dept.charAt(0).toLocaleUpperCase('nl')+dept.slice(1);
}
export function sortActivityLikePersonnel(records){
 return [...(Array.isArray(records)?records:[])].sort((a,b)=>{
  const da=DEPT_ORDER[a.department]??99,db=DEPT_ORDER[b.department]??99;
  if(da!==db)return da-db;
  if(da===99){
    const byDept=compareText(a.department,b.department);
    if(byDept)return byDept;
  }
  if(a.department==='politie'&&b.department==='politie'){
    const ta=activityRosterGroup(a).split(':')[1],tb=activityRosterGroup(b).split(':')[1];
    const diff=policeTierDisplay(ta).order-policeTierDisplay(tb).order;
    if(diff)return diff;
  }
  const na=callNumber(a.call),nb=callNumber(b.call);
  if(na!==null&&nb!==null&&na!==nb){
    if(a.department==='politie'){
      // Keep the personnel-list series (e.g. 7xx before 6xx, 5xx before 4xx),
      // but display callsigns INSIDE each series ascending: 700, 710, 720...
      const seriesA=Math.floor(na/100),seriesB=Math.floor(nb/100);
      if(seriesA!==seriesB)return seriesB-seriesA;
      return na-nb;
    }
    return nb-na; // retain existing non-police service order
  }
  if(na!==null&&nb===null)return -1;
  if(na===null&&nb!==null)return 1;
  return compareText(a.name,b.name)||compareText(a.discordId,b.discordId);
 });
}
