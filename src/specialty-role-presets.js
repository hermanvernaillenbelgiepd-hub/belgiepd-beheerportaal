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
  ['1309532437952466987','Gevaarlijke stoffen'],
  ['1466508322566967609','Brandweer-AMBU']
 ].map(([roleId,label])=>Object.freeze({
  roleId,label,level:'Volwaardig',value:'Ja',assetKey:''
 }))
]);
// One verified BW log/signa role can select TWO distinct qualifications.
// Historical BW SIG/LOG uploads have stable, explicit aliases.
export const fireSpecialtyAssetKeys=label=>{
 const aliases={
  'Logistiek':['logistiek','bw_log','bw_logistiek'],
  'Signalisatie':['signalisatie','bw_sig','bw_signal','bw_signalisatie','bw_signa'],
  'Ladderwagen':['ladderwagen','bw_ladderwagen'],
  'Bosbestrijding':['bosbestrijding','boswagen','bw_boswagen','bw_bosbestrijding'],
  'Duiker':['duiker','bw_duiker'],
  'RED team':['red_team','redteam','bw_red_team','bw_redteam'],
  'Gevaarlijke stoffen':['gevaarlijke_stoffen','gevaarlijkestoffen','ags','bw_ags','bw_gevaarlijke_stoffen'],
  'Brandweer-AMBU':['brandweer_ambu','bw_ambu','ambu'],
  'Grote Boot':['grote_boot','groteboot','bw_grote_boot','bw_boot']
 };
 return [...new Set(aliases[label]||[])].flatMap(code=>
  ['specialty','patch'].flatMap(kind=>
   [code,code+'_lokaal',code+'_federaal'].map(suffix=>kind+'_brandweer_'+suffix)));
};

// Police-only presentation aliases must not be applied to other services.
// In particular, Brandweer "Signalisatie" is NOT "SIGNALISATIE".
export const normalizedSpecialtyLinkLabel=(dept,label)=>{
 if(dept!=='politie')return label;
 const aliases={'Motor':'MOTARD','Motard':'MOTARD','Semi-ano.':'SEMI ANONIEM',
  'Semi-anoniem':'SEMI ANONIEM','Dispatch':'DISP','Radio BM':'RADIO/BM',
  'Signalisatie':'SIGNALISATIE','SIV/WPR':'SIGNALISATIE','K-9':'K9'};
 return aliases[label]||label;
};
export const fireSharedSpecialtyAssetKeys=fireSpecialtyAssetKeys;
// AZLS: qualifications from exact verified Discord role IDs.
// Professional categories (Arts, Verpleegkundige, AZLS leiding) and the
// Medisch-instructeur assignment are distinct functions, not qualifications.
// Operational Depannage role labels from the verified role catalog.
// AWV is leadership, not a specialist qualification, so is deliberately excluded.
export const DEPANNAGE_ROLE_PATCH_PRESETS=Object.freeze([
 ['1309532438019706970','F.A.S.T'],
 ['1309532438019706971','LSRA']
].map(([roleId,label])=>Object.freeze({
 roleId,label,level:'Volwaardig',value:'Ja',assetKey:''
})));
export const AZLS_PIT_MOTOR_ROLE_ID='1508506242299985980';
export const AMBULANCE_ROLE_PATCH_PRESETS=Object.freeze([
 ['1360990854445137980','MIP'],
 ['1360990813357609181','HELI'],
 [AZLS_PIT_MOTOR_ROLE_ID,'PIT-MOTOR']
].map(([roleId,label])=>Object.freeze({
 roleId,label,level:'Volwaardig',value:'Ja',assetKey:''
})));
export const ambulanceSpecialtyAssetKeys=label=>{
 const codes=label==='MIP'?['mip']:label==='HELI'?['heli','mug_heli']:
  label==='PIT-MOTOR'?['pit_motor','pitmotor']:[];
 return codes.flatMap(code=>['specialty','patch'].flatMap(kind=>
  [code,code+'_lokaal',code+'_federaal'].map(suffix=>kind+'_ambulance_'+suffix)));
};
export const knownAmbulanceRoleSpecialty=(roleId,label)=>
 AMBULANCE_ROLE_PATCH_PRESETS.some(x=>x.roleId===roleId&&x.label===label);
export const AZLS_FUNCTION_ROLES=Object.freeze([
 ['1309532438053130325','AZLS Leiding'],
 ['1309532437977497695','Arts'],
 ['1309532437977497696','Verpleegkundige'],
 ['1309532437952466988','Medisch Instructeur']
]);
export function verifiedAzlsFunctions(identity,guildId,now=Date.now()){
 if(identity?.guildId!==guildId||!/^\d{15,22}$/.test(String(guildId||''))||
    !Number.isSafeInteger(identity.verifiedAt)||
    identity.verifiedAt>now+60000||now-identity.verifiedAt>7*86400000||
    !Array.isArray(identity.roleIds)||
    identity.roleIds.some(x=>typeof x!=='string'||!/^\d{15,22}$/.test(x)))
  return [];
 const have=new Set(identity.roleIds);
 return AZLS_FUNCTION_ROLES.filter(([roleId])=>have.has(roleId)).map(([,label])=>label);
}

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
 if(dept==='ambulance'){
  const known=new Set(stored.filter(x=>x.roleId).map(x=>x.roleId));
  return [...stored,...AMBULANCE_ROLE_PATCH_PRESETS.filter(x=>!known.has(x.roleId))
   .map(x=>({...x}))];
 }
 if(dept==='depannage'){
  const known=new Set(stored.filter(x=>x.roleId).map(x=>x.roleId));
  return [...stored,...DEPANNAGE_ROLE_PATCH_PRESETS.filter(x=>!known.has(x.roleId))
   .map(x=>({...x}))];
 }
 if(dept!=='politie'||alreadyApplied)return stored;
 const known=new Set(stored.map(x=>x.roleId).filter(Boolean));
 return [...stored,...policeRolePatchPresets().filter(x=>!known.has(x.roleId))];
}
