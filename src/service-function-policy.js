// These are APPROVED PORTAL classifications, not a Discord role lookup.
// Titles like DIR-MED and ZONE never bypass independent guild/roster
// verification on protected medical/fire personnel and reporting endpoints.
export const SERVICE_FUNCTIONS=Object.freeze({
  politie:Object.freeze([
    {id:'agentenkader',label:'Agentenkader',role:'basiskader'},
    {id:'basiskader',label:'Basiskader',role:'basiskader'},
    {id:'middenkader',label:'Middenkader',role:'middenkader'},
    {id:'officierenkader',label:'Officierenkader',role:'officierenkader'},
    {id:'korpsleiding',label:'Korpsleiding',role:'korpsleiding'}
  ]),
  ambulance:Object.freeze([
    {id:'ambulance',label:'Ambulance',role:'basiskader'},
    {id:'verpleegkundige',label:'Verpleegkundige',role:'basiskader'},
    {id:'arts',label:'Arts',role:'basiskader'},
    {id:'medisch-instructeur',label:'Medisch-Instructeur',role:'middenkader'},
    {id:'azls-leiding',label:'AZLS-leiding',role:'officierenkader'},
    {id:'dir-med',label:'DIR-MED',role:'korpsleiding'}
  ]),
  brandweer:Object.freeze([
    {id:'brandweer',label:'Brandweer',role:'basiskader'},
    {id:'bw-middenkader',label:'BW-middenkader',role:'middenkader'},
    {id:'bw-leiding',label:'BW-leiding',role:'officierenkader'},
    {id:'zone',label:'ZONE',role:'korpsleiding'}
  ]),
  depannage:Object.freeze([
    {id:'lsra',label:'LSRA / Depannage',role:'basiskader'},
    {id:'fast',label:'F.A.S.T',role:'basiskader'},
    {id:'awv',label:'Agentschap Wegen & Verkeer',role:'korpsleiding'}
  ])
});
export const SERVICE_RANK=Object.freeze({
  basiskader:1,middenkader:2,officierenkader:3,korpsleiding:4
});
export function choiceFor(department,functionId){
  return SERVICE_FUNCTIONS[department]?.find(item=>item.id===functionId)||null;
}
export function defaultFunction(department,role){
  const choices=SERVICE_FUNCTIONS[department]||[];
  return choices.find(item=>item.id===role)?.id||
    choices.find(item=>item.role===role)?.id||null;
}
const ID=/^\d{15,22}$/;
export function parseServiceFunctionChange(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(k=>!['department','functionId','reason'].includes(k)))
    throw Error('Ongeldige dienstwijziging');
  const department=body.department,func=choiceFor(department,body.functionId);
  if(!func)throw Error('Selecteer een bestaande functie binnen de hulpdienst');
  const reason=String(body.reason||'').trim();
  if(reason.length<8||reason.length>300)throw Error('Motivering van 8 tot 300 tekens verplicht');
  return {department,functionId:func.id,role:func.role,reason};
}
export function parseServiceRevoke(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(k=>!['department','reason'].includes(k))||
     !Object.hasOwn(SERVICE_FUNCTIONS,body.department))
    throw Error('Ongeldige hulpdienst');
  const reason=String(body.reason||'').trim();
  if(reason.length<8||reason.length>300)throw Error('Motivering van 8 tot 300 tekens verplicht');
  return {department:body.department,reason};
}
export function applyServiceFunction(approved,change){
  const departments=[...new Set([...approved.departments,change.department])];
  const departmentRoles={...approved.departmentRoles,[change.department]:change.role};
  const role=Object.values(departmentRoles).reduce((top,next)=>
    SERVICE_RANK[next]>SERVICE_RANK[top]?next:top,'basiskader');
  return {departments,departmentRoles,role,
    serviceFunctions:{...(approved.serviceFunctions||{}),[change.department]:change.functionId}};
}
export function removeServiceFunction(approved,department){
  if(!approved.departments.includes(department)||approved.departments.length<2)
    throw Error('De laatste hulpdienst kan niet afzonderlijk worden ingetrokken; blokkeer het account indien nodig');
  const departments=approved.departments.filter(d=>d!==department);
  const departmentRoles={...approved.departmentRoles};
  delete departmentRoles[department];
  const serviceFunctions={...(approved.serviceFunctions||{})};
  delete serviceFunctions[department];
  const role=Object.values(departmentRoles).reduce((top,next)=>
    SERVICE_RANK[next]>SERVICE_RANK[top]?next:top,'basiskader');
  return {departments,departmentRoles,role,serviceFunctions};
}
export function mayEditServiceFunction(actor,targetId,approved,department,nextRole,{technical=false}={}){
  if(!ID.test(String(targetId||''))||actor?.discordId===targetId||
     actor?.uid==='discord:'+targetId||!approved||
     !SERVICE_FUNCTIONS[department]||
     (nextRole!==null&&!SERVICE_RANK[nextRole]))return false;
  if(technical)return true;
  // Only a manager of the SAME department may change a subordinate grade.
  // Adding another service to an already approved account is technical-only.
  if(!approved.departments.includes(department))return false;
  if(!actor?.departments?.includes(department))return false;
  if(department!=='politie'&&department!=='depannage')return false;
  // Do not infer other service management from a high global cadre.
  const own=actor.departmentRoles?.[department]||(
    actor.departments.length===1?actor.role:null);
  const max=own==='korpsleiding'?3:own==='officierenkader'?2:0;
  const current=approved.departmentRoles[department];
  return max>0&&SERVICE_RANK[current]<=max&&
    (nextRole===null||SERVICE_RANK[nextRole]<=max);
}
