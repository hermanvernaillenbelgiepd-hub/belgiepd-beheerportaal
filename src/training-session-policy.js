// A verified held lesson has its own stable ID, separate from student outcomes.
// Older per-student records without such an ID cannot prove a distinct lesson.
export const TRAINING_SESSION_COLLECTION='bpd_training_sessions';
export const TRAINING_SESSION_DEPARTMENTS=Object.freeze([
  'politie','brandweer','ambulance','depannage','burger'
]);
const ID=/^\d{15,22}$/;
export const validLessonSessionId=value=>
  typeof value==='string'&&/^[A-Za-z0-9]{12,30}$/.test(value);
export const validLessonDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const millis=Date.parse(value+'T12:00:00Z');
  return Number.isFinite(millis)&&new Date(millis).toISOString().slice(0,10)===value;
};
export function validateHeldLessonInput(raw,today){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['department','courseName','eventDate'].includes(k)))
    throw Error('Ongeldige lesmomentregistratie');
  if(!TRAINING_SESSION_DEPARTMENTS.includes(raw.department))
    throw Error('Ongeldige dienst voor het lesmoment');
  const courseName=typeof raw.courseName==='string'?raw.courseName.trim():'';
  if(courseName.length<3||courseName.length>150||
    /[<>\x00-\x1f\x7f]/.test(courseName))
    throw Error('Vul een geldige opleidingsnaam in');
  if(!validLessonDate(raw.eventDate)||!validLessonDate(today)||
    raw.eventDate>today)throw Error('Vul een geldige lesdatum tot en met vandaag in');
  return {department:raw.department,courseName,eventDate:raw.eventDate};
}
export function lessonSessionForTraining(session,training){
  return Boolean(session&&training&&
    validLessonSessionId(session.id)&&session.id===training.lessonSessionId&&
    session.status==='gegeven'&&session.verifiedInstructor===true&&
    TRAINING_SESSION_DEPARTMENTS.includes(session.department)&&
    ID.test(session.instructorDiscordId||'')&&
    ID.test(training.subjectDiscordId||'')&&
    session.department===training.department&&
    session.eventDate===training.eventDate&&
    session.courseName===training.courseName&&
    session.instructorDiscordId===training.instructorDiscordId&&
    !training.archivedAt&&training.status!=='verwijderd'&&
    training.status!=='archived'&&training.testRecord!==true);
}
// Count each distinct verified session once per instructor. Participant
// participation is unique per session + trainee, not per result record.
export function confirmedLessonsByInstructor(trainings,sessions,department,period){
  const lookup=new Map((Array.isArray(sessions)?sessions:[])
    .filter(s=>s?.department===department&&
      validLessonDate(s.eventDate)&&s.eventDate>=period.start&&
      s.eventDate<=period.end&&validLessonSessionId(s.id))
    .map(s=>[s.id,s]));
  const attendance=new Map();
  for(const r of Array.isArray(trainings)?trainings:[]){
    if(!r||!validLessonDate(r.eventDate)||r.eventDate<period.start||
      r.eventDate>period.end)continue;
    const s=lookup.get(r.lessonSessionId);
    if(!lessonSessionForTraining(s,r))continue;
    if(!attendance.has(s.id))attendance.set(s.id,{
      instructorDiscordId:s.instructorDiscordId,participants:new Set()
    });
    attendance.get(s.id).participants.add(r.subjectDiscordId);
  }
  const byInstructor=new Map();
  for(const session of attendance.values()){
    const current=byInstructor.get(session.instructorDiscordId)||{
      lesmomenten:0,lesdeelnames:0
    };
    current.lesmomenten++;
    current.lesdeelnames+=session.participants.size;
    byInstructor.set(session.instructorDiscordId,current);
  }
  return byInstructor;
}
