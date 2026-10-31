// Global, presentation-only police personnel-list dimensions.
// A browser must never infer editing rights from a call number or roster row.
// The route checks the authenticated member's current verified Discord officer role.
export const PERSONNEL_ROSTER_FONT_FAMILIES=Object.freeze([
 'inter','segoe','arial','verdana','tahoma','georgia','mono'
]);
export const PERSONNEL_ROSTER_DEFAULT=Object.freeze({
 fontFamily:'inter',
 rowHeight:28,
 textSize:11,
 insigniaWidth:30,
 tableWidth:1280,
 cellPadding:3,
 nameColumn:150,
 rankColumn:165
});
const BOUNDS=Object.freeze({
 rowHeight:[26,64],
 textSize:[9,16],
 insigniaWidth:[24,75],
 tableWidth:[1120,2500],
 cellPadding:[1,12],
 nameColumn:[115,340],
 rankColumn:[130,340]
});
export function validatePersonnelRosterLayout(value){
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new Error('Ongeldige afmetingen');
 const keys=Object.keys(PERSONNEL_ROSTER_DEFAULT);
 if(Object.keys(value).length!==keys.length||
    Object.keys(value).some(key=>!keys.includes(key)))
  throw new Error('Onbekende of ontbrekende afmetingen');
 const sanitized={fontFamily:value.fontFamily};
 if(!PERSONNEL_ROSTER_FONT_FAMILIES.includes(value.fontFamily))
  throw new Error('Ongeldig lettertype');
 for(const key of keys.filter(key=>key!=='fontFamily')){
  const raw=value[key],range=BOUNDS[key];
  if(!Number.isSafeInteger(raw)||raw<range[0]||raw>range[1])
   throw new Error('Ongeldige waarde voor '+key);
  sanitized[key]=raw;
 }
 return sanitized;
}
export function savedPersonnelRosterLayout(value){
 // Preserve older seven-field layouts saved before fonts became configurable.
 const candidate=value&&typeof value==='object'&&!Array.isArray(value)&&
  value.fontFamily===undefined?{...value,fontFamily:'inter'}:value;
 try{return validatePersonnelRosterLayout(candidate);}
 catch{return {...PERSONNEL_ROSTER_DEFAULT};}
}
