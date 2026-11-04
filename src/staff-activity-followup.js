// Read-only management follow-up for existing 50/50/INACTIEF personnel
// statuses. A status is not evidence that a personal ping was delivered.
// Never use this helper to send a ping or to modify a roster record.
import {mayReadManagement} from './management-utils.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';

const ID=/^\d{15,22}$/;
const DEPARTMENTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
const STATUS=Object.freeze({'50/50':'50/50','inactief':'INACTIEF'});
const deptOrder=Object.fromEntries(DEPARTMENTS.map((d,i)=>[d,i]));
const collator=new Intl.Collator('nl',{numeric:true,sensitivity:'base'});
const callNumber=value=>{
 const m=/^(?:[a-z]{1,12}[- ]?)?(\d{1,4})$/i.exec(String(value||'').trim());
 return m?Number(m[1]):null;
};

export function staffActivityFollowup(actor,roster,{maxResults=250}={}){
 const technical=actor?.portalTechnicalMode===true&&
  actor?.profileTechnicalAvailable===true&&ID.test(String(actor?.discordId||''))&&
  actor?.uid==='discord:'+actor.discordId;
 const permitted=DEPARTMENTS.filter(dept=>
  mayReadManagement(actor,dept)&&(
    ['middenkader','officierenkader','korpsleiding'].includes(roleForDepartment(actor,dept))||
    technical||actor?.boardPersonnelAdmin===true
  ));
 if(!permitted.length)return {allowed:false,people:[],counts:{'50/50':0,INACTIEF:0},limited:false};
 const seen=new Set(),rows=[];
 for(const person of Array.isArray(roster)?roster:[]){
  const dept=person?.dept,id=String(person?.personId||'');
  if(!permitted.includes(dept)||!ID.test(id)||
    person.lifecycleState==='archived'||person.lifecycleState==='pending'||
    !canReadPersonnelSubject(actor,person))continue;
  const status=STATUS[String(person.status||'').trim().toLocaleLowerCase('nl')];
  if(!status)continue;
  const key=dept+':'+id;
  if(seen.has(key))continue;
  seen.add(key);
  rows.push({
   department:dept,discordId:id,call:String(person.call||'').slice(0,24),
   name:String(person.name||'').slice(0,120),status
  });
 }
 rows.sort((a,b)=>{
  const d=(deptOrder[a.department]??99)-(deptOrder[b.department]??99);
  if(d)return d;
  const an=callNumber(a.call),bn=callNumber(b.call);
  if(an!==null&&bn!==null&&an!==bn)return an-bn;
  return collator.compare(a.call,b.call)||collator.compare(a.name,b.name);
 });
 const counts={'50/50':rows.filter(p=>p.status==='50/50').length,
  INACTIEF:rows.filter(p=>p.status==='INACTIEF').length};
 return {allowed:true,people:rows.slice(0,maxResults),counts,
  limited:rows.length>maxResults,total:rows.length,
  source:'current_personnel_status',pingsAreSeparate:true};
}
