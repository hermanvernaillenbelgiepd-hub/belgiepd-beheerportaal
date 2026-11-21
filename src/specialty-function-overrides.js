// Display-only specialization functions. A group leader is NOT implicitly an instructor.
// An explicit choice wins over an ambiguous shared Discord group.
const VALUES=new Set(['lid','groepsleider','instructeur','beide']);
export function validateFunctionOverrides(value,allowed,withoutInstructors=[]){
 if(value===undefined||value===null)return {};
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ongeldige functieselectie');
 const entries=Object.entries(value),noInstructor=new Set(withoutInstructors);
 if(entries.length>allowed.length)throw Error('Te veel functieselecties');
 const out={};
 for(const [name,role] of entries){
  if(!allowed.includes(name)||!VALUES.has(role)||
    ((role==='instructeur'||role==='beide')&&noInstructor.has(name)))
   throw Error('Ongeldige groepsleider-/instructeurfunctie');
  out[name]=role;
 }
 return out;
}
export function resolveFunctionOverrides(instructors,overrides){
 const all=new Set(Array.isArray(instructors)?instructors:[]),leaders=[];
 for(const [name,mode] of Object.entries(overrides||{})){
  if(mode==='instructeur'||mode==='beide')all.add(name);
  else if(mode==='lid'||mode==='groepsleider')all.delete(name);
  if(mode==='groepsleider'||mode==='beide')leaders.push(name);
 }
 return {instructors:[...all],groupLeaders:leaders};
}
