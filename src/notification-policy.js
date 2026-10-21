import {roleForDepartment,calendarDays} from './leave-policy.js';
export const POLICE_SERIES=Object.freeze(['1','2','3']);
export const NOTIFICATION_THRESHOLDS=Object.freeze([{warn:12,due:15,label:'50/50'},{warn:27,due:31,label:'Inactief'},{warn:57,due:61,label:'Controle op eventuele uitschrijving'}]);
const ID=/^\d{15,22}$/;
const dayMs=86400000;
export const utcDay=d=>new Date(d+'T00:00:00.000Z').getTime();
const unique=x=>[...new Set(x)];
export function currentFortnight(date=new Date(),anchor='2026-10-19'){
  const now=typeof date==='string'?utcDay(date):Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
  const a=utcDay(anchor);
  const step=Math.floor((now-a)/(14*dayMs))*14;
  return periodAt(new Date(a+step*dayMs).toISOString().slice(0,10));
}
export function periodAt(start){
  const date=utcDay(start);
  if(new Date(date).getUTCDay()!==1)throw Error('Rapportperiode moet op maandag beginnen');
  return {start,end:new Date(date+13*dayMs).toISOString().slice(0,10),days:14};
}
export function periodsForActor(today,actor,anchor='2026-10-19'){
  const scoped=roleForDepartment(actor,'politie');
  if(!['middenkader','officierenkader','korpsleiding'].includes(scoped))return [];
  const latest=currentFortnight(today,anchor);
  const shift=n=>periodAt(new Date(utcDay(latest.start)-n*14*dayMs).toISOString().slice(0,10));
  return scoped==='middenkader'?[shift(0),shift(1)]:
    Array.from({length:27},(_,i)=>shift(i));
}
export function monthlyActivityStatus(hours){
  if(typeof hours!=='number'||!Number.isFinite(hours)||hours<0)return null;
  // Exactly 20 hours remains 50/50; active starts strictly above 20.
  return hours<=10?'Inactief':hours<=20?'50/50':'Actief';
}
export function normalizeSeries(person){
  const raw=String(person?.seriesRaw||'').trim();
  const displayed=String(person?.series||'').trim();
  if(POLICE_SERIES.includes(raw))return raw;
  const match=/^Reeks\s+([123])$/i.exec(displayed);
  if(match)return match[1];
  return null;
}
export function policeSeriesHeads(env){
  let parsed;
  try{parsed=JSON.parse(env.BPD_POLICE_SERIES_HEADS_JSON||'{}');}catch{return {};}
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')return {};
  return Object.fromEntries(POLICE_SERIES.map(n=>[n,
    Array.isArray(parsed[n])?unique(parsed[n].filter(x=>typeof x==='string'&&ID.test(x))):[]]));
}
export function policeScope(actor,heads){
  const role=roleForDepartment(actor,'politie');
  if(!actor?.departments?.includes('politie')||!ID.test(actor.discordId))return {role:null,series:[]};
  if(['officierenkader','korpsleiding'].includes(role))return {role,series:[...POLICE_SERIES]};
  if(role==='middenkader')return {role,series:POLICE_SERIES.filter(n=>heads[n]?.includes(actor.discordId))};
  return {role,series:[]};
}
export function warningFor(person){
  if(person?.dept!=='politie'||person.status==='Verlof'||person.status==='Afwezig')return null;
  // 'last' is days since last connection in the established activities check.
  const days=person.last;
  if(!Number.isSafeInteger(days)||days<0)return null;
  const threshold=[...NOTIFICATION_THRESHOLDS].reverse().find(t=>days>=t.warn&&days<t.due);
  return threshold?{...threshold,days}:null;
}
export function isPoliceMember(actor,person){
  return Boolean(person&&person.dept==='politie'&&person.personId===actor?.discordId);
}
export function afterLeave(leave,today){
  return leave?.status==='approved'&&
    typeof leave.endDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(leave.endDate)&&
    leave.endDate<today&&Array.isArray(leave.subjectDepartments)&&
    leave.subjectDepartments.includes('politie');
}
export function subjectPoliceGrade(person){
  const grade=String(person?.rank||'').toLocaleLowerCase('nl');
  if(/commissaris|\bcp\b|korpsleiding|1hcp/.test(grade))return 'korpsleiding';
  if(/\bah?cp\b|officierenkader/.test(grade))return 'officierenkader';
  if(/hoofdinspecteur|hinp|middenkader/.test(grade))return 'middenkader';
  return 'basiskader';
}
export function leaveAuthority(actor,leave,subject){
  if(!subject||subject.dept!=='politie'||leave?.status!=='pending'||actor?.discordId===subject.personId)return false;
  const role=roleForDepartment(actor,'politie');
  const target=subjectPoliceGrade(subject);
  const days=calendarDays(leave.startDate,leave.endDate);
  if(target==='korpsleiding')return false; // Korpsleiding records leave without requiring approval.
  if(target==='officierenkader')return role==='korpsleiding'||role==='beheerder'||
    (role==='officierenkader'&&days<=30);
  if(target==='middenkader')return ['officierenkader','korpsleiding','beheerder'].includes(role);
  return ['middenkader','officierenkader','korpsleiding','beheerder'].includes(role)&&
    (days<=30||role!=='middenkader');
}
