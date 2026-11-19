// Read-only projection of *open* approved-leave return reviews. This is
// never a personnel edit or an automatic Discord/cadre rank action.
const ACTIVE=/^(?:actief|inactief|non[- ]actief|50\/50|verlof|checking)$/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ID=/^\d{15,22}$/;
export function projectLeaveReturnChecking(people,checks,approved,today){
 if(!DATE.test(String(today||''))||!Array.isArray(people))return people;
 const leaves=new Map();
 for(const l of approved||[]){
  if(l?.status!=='approved'||l.historicalImport===true||
   !ID.test(String(l.personDiscordId||''))||
   !DATE.test(l.startDate)||!DATE.test(l.endDate)||l.startDate>l.endDate)continue;
  const arr=leaves.get(l.personDiscordId)||[];
  arr.push(l);leaves.set(l.personDiscordId,arr);
 }
 const open=new Map();
 for(const c of checks||[]){
  if(c?.status!=='CHECKING'||!ID.test(String(c.discordId||''))||
     !DATE.test(c.endDate)||c.endDate>=today)continue;
  const key=c.dept+':'+c.discordId,prev=open.get(key);
  if(!prev||c.endDate>prev.endDate)open.set(key,c);
 }
 return people.map(p=>{
  const key=p?.dept+':'+p?.personId,c=open.get(key);
  if(!c||!ACTIVE.test(String(p.status||''))||
    ['archived','pending'].includes(p.lifecycleState))return p;
  const personLeaves=leaves.get(p.personId)||[];
  if(personLeaves.some(l=>l.startDate<=today&&l.endDate>=today))return p;
  // A newer approved leave must not be displaced by an older open check.
  if(personLeaves.some(l=>l.endDate<today&&l.endDate>c.endDate))return p;
  if(!personLeaves.some(l=>l.endDate===c.endDate))return p;
  return {...p,status:'CHECKING',statusBeforeChecking:p.status,
    leaveReturnChecking:true,leaveReturnEndDate:c.endDate};
 });
}
