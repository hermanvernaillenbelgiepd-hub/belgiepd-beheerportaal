// Curated BelgiumPD visual qualification mappings. No Discord write or access grant.
// The assetKey stays empty until an approved image is uploaded to the image library.
// Levels remain distinct even when several roles share one specialization column.
export const POLICE_ROLE_PATCH_PRESETS=Object.freeze([
 ['1345297414612979713','K9','Geleider in stage','Stage'],
 ['1309532437977497699','K9','Geleider','Ja'],
 ['1345302115689431061','K9','Instructeur','INSTRUCTEUR'],
 ['1337852029611016233','Dispatch','Selectie / in opleiding','Stage'],
 ['1309532438019706963','Dispatch','Volwaardig','Ja'],
 ['1393050971604516904','Dispatch','Instructeur','INSTRUCTEUR'],
 ['1309542190409580594','AE','AE-I','Stage'],
 ['1310674604821581894','AE','AE-T','Ja'],
 ['1337775768083632158','AE','Teamleader','LEIDING'],
 ['1337156006597103746','AE','Instructeur','INSTRUCTEUR'],
 ['1490841316656156802','RAGO','In opleiding (halve wing)','Stage'],
 ['1309532437977497700','RAGO','Volwaardig (volledige wing)','Ja'],
 ['1393050551188721865','RAGO','Instructeur (volledige wing)','INSTRUCTEUR'],
 ['1365602771855740958','Motor','In opleiding','Stage'],
 ['1358148694297415741','Motor','Volwaardig','Ja'],
 ['1359656762289946755','Motor','Instructeur','INSTRUCTEUR'],
 ['1309532438019706962','Terreinondersteuner','Volwaardig','Ja']
].map(([roleId,label,level,value])=>Object.freeze({
 roleId,label,level,value,assetKey:''
})));
export const policeRolePatchPresets=()=>POLICE_ROLE_PATCH_PRESETS.map(x=>({...x}));
// Upgrades an old manually saved mapping once, while leaving its entries intact.
// After saving presetVersion=1, deleted/changed presets are NOT reinserted.
export const POLICE_PATCH_PRESET_VERSION=1;
export function defaultSpecialtyRoleLinks(dept,stored,alreadyApplied){
 if(dept!=='politie'||alreadyApplied)return stored;
 const known=new Set(stored.map(x=>x.roleId).filter(Boolean));
 return [...stored,...policeRolePatchPresets().filter(x=>!known.has(x.roleId))];
}
