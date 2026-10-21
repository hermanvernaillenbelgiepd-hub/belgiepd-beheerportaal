// Shared TO incident shortcuts are kept independently of shifts and archives.
// Never include a postcode, callers, suspects or other incident-specific data.
export const TO_SHORTCUT_LIMIT=30;
export const emptyTOShortcuts=()=>({revision:0,items:{}});
const problem=(status,message)=>{throw Object.assign(new Error(message),{publicStatus:status});};
const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const clean=(value,max,required=false)=>{
  if(typeof value!=='string')problem(400,'Ongeldige sneltoets');
  const result=value.trim().replace(/\s+/g,' ');
  if(result.length>max||(required&&!result)||/[\x00-\x1f\x7f<>]/.test(value))problem(400,'Ongeldige sneltoets');
  return result;
};
export function applyTOShortcutCommand(current,cmd,{actor,now,id}={}){
  if(!actor?.uid||typeof actor.uid!=='string'||actor.uid.length>128)problem(403,'Aanmelding vereist');
  if(!Number.isSafeInteger(now)||now<1)problem(400,'Ongeldige tijd');
  if(!cmd||Object.getPrototypeOf(cmd)!==Object.prototype||!['add','remove'].includes(cmd.action))problem(400,'Ongeldige sneltoetsactie');
  const allowed=cmd.action==='add'?['action','expectedRevision','title','description']:['action','expectedRevision','id'];
  if(Object.keys(cmd).some(key=>!allowed.includes(key)))problem(400,'Ongeldige sneltoetsvelden');
  const base=current??emptyTOShortcuts();
  if(!Number.isSafeInteger(base.revision)||base.revision<0||!base.items||Array.isArray(base.items))throw new Error('Ongeldige sneltoetsopslag');
  if(!Number.isSafeInteger(cmd.expectedRevision)||cmd.expectedRevision!==base.revision)problem(409,'De sneltoetsen zijn gewijzigd; vernieuw en probeer opnieuw.');
  const updated=structuredClone(base);
  if(cmd.action==='add'){
    const title=clean(cmd.title,80,true),description=clean(cmd.description??'',500);
    if(Object.keys(updated.items).length>=TO_SHORTCUT_LIMIT)problem(413,'Maximum 30 meldingssneltoetsen bereikt');
    if(Object.values(updated.items).some(item=>item.title.toLocaleLowerCase('nl-BE')===title.toLocaleLowerCase('nl-BE')))
      problem(409,'Een sneltoets met deze naam bestaat al.');
    const newId=typeof id==='function'?id():id;
    if(!validId(newId)||Object.hasOwn(updated.items,newId))throw new Error('Ongeldige nieuwe sneltoets-ID');
    updated.items[newId]={id:newId,title,description,createdAt:now,createdBy:actor.uid};
  }else{
    if(!validId(cmd.id))problem(400,'Ongeldige sneltoetsverwijzing');
    if(!Object.hasOwn(updated.items,cmd.id))problem(409,'Deze sneltoets bestaat niet meer.');
    delete updated.items[cmd.id];
  }
  updated.revision++;
  return updated;
}
