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
 ['1490841316656156802','RAGO','In opleiding (halve wing)','AANGEMELD'],
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
// BW log/signa is a shared Discord role: precisely TWO visually distinct
// qualifications. Never changes Discord role assignments or personnel rights.
export const BW_LOG_SIG_ROLE_ID='1309532437952466986';
export const BW_LOG_SIG_SPECIALTIES=Object.freeze(['Logistiek','Signalisatie']);
export const BW_LOG_SIG_PRESETS=Object.freeze(BW_LOG_SIG_SPECIALTIES.map(label=>
 Object.freeze({roleId:BW_LOG_SIG_ROLE_ID,label,level:'Volwaardig',value:'Ja',assetKey:''})
));
// Other verified Brandweer specialization roles are also qualified by ID,
// never by an editable role name. Empty image references use library codes.
export const FIRE_ROLE_PATCH_PRESETS=Object.freeze([
 ...BW_LOG_SIG_PRESETS,
 ...[
  ['1399000349037166664','Ladderwagen'],
  ['1399006120965570670','Bosbestrijding'],
  ['1309532437952466985','Duiker'],
  ['1399000449457197188','RED team'],
  ['1309532437952466987','Gevaarlijke stoffen']
 ].map(([roleId,label])=>Object.freeze({
  roleId,label,level:'Volwaardig',value:'Ja',assetKey:''
 }))
]);
export const fireSpecialtyAssetKeys=label=>{
 const aliases={'Logistiek':'logistiek','Signalisatie':'signalisatie',
  'Ladderwagen':'ladderwagen','Bosbestrijding':'bosbestrijding',
  'Duiker':'duiker','RED team':'red_team',
  'Gevaarlijke stoffen':'gevaarlijke_stoffen'};
 const code=aliases[label]||'';
 return code?['specialty','patch'].flatMap(kind=>
  [code,code+'_lokaal',code+'_federaal'].map(suffix=>kind+'_brandweer_'+suffix)):[];
};
export const fireSharedSpecialtyAssetKeys=fireSpecialtyAssetKeys;
export const knownFireRoleSpecialty=(roleId,label)=>FIRE_ROLE_PATCH_PRESETS.some(x=>
 x.roleId===roleId&&x.label===label);
export function defaultSpecialtyRoleLinks(dept,stored,alreadyApplied){
 if(dept==='brandweer'){
  const known=new Set(stored.filter(x=>x.roleId).map(x=>
   x.roleId===BW_LOG_SIG_ROLE_ID?x.roleId+':'+x.label:x.roleId));
  return [...stored,...FIRE_ROLE_PATCH_PRESETS.filter(x=>
   !known.has(x.roleId===BW_LOG_SIG_ROLE_ID?x.roleId+':'+x.label:x.roleId))
   .map(x=>({...x}))];
 }
 if(dept!=='politie'||alreadyApplied)return stored;
 const known=new Set(stored.map(x=>x.roleId).filter(Boolean));
 return [...stored,...policeRolePatchPresets().filter(x=>!known.has(x.roleId))];
}
