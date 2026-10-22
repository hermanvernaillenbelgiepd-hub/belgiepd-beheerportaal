// BelgiumPD 0.9.3: gecontroleerde Discord-rolcatalogus.
// Rol-ID's zijn door serverbeheer opgegeven; namen zijn GEEN bewijs van bevoegdheid.
// Aanvullende rollen kunnen in latere versies worden toegevoegd.
const make=(dept,kind,entries)=>entries.map(([id,name,stage='volwaardig'])=>({id,name,dept,kind,stage}));
export const SERVICE_DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger','dispatch']);
export const ROLE_CATALOG=Object.freeze([
  ...make('politie','lidmaatschap',[
    ['1309532438053130326','Politie'],['1351212180120408166','Basiskader'],
    ['1448043875284287599','Reeks 1','opleiding'],['1448043426502148159','Reeks 2','opleiding'],
    ['1448043995371540603','Reeks 3','opleiding'],['1448044041823322253','Reeks 4','opleiding'],
    ['1335578488664490057','Middenkader (leidinggevende)'],['1473474238664020151','Officierenkader'],
    ['1353670078142615592','Korpsleiding']]),
  ...make('politie','specialisatie',[
    ['1537606324886442035','Motard-IO','opleiding'],['1358148694297415741','Motard'],
    ['1359656762289946755','Motard-instructeur'],['1508506242299985980','PIT-MOTOR'],
    ['1309542190409580594','AE-I (SRT)'],['1310674604821581894','AE-T (DSU)'],
    ['1309542523731181749','AE-leiding'],['1337156006597103746','AE-instructeur'],
    ['1337775768083632158','AE-teamleader'],['1380843428354592780','Lokale Recherche'],
    ['1345297414612979713','K9-IO','opleiding'],['1309532437977497699','K9'],
    ['1345302115689431061','K9-instructeur'],['1490841316656156802','RAGO-IO','opleiding'],
    ['1309532437977497700','RAGO'],['1393050551188721865','RAGO-instructeur'],
    ['1309532438019706962','Terreinondersteuner']]),
  ...make('dispatch','lidmaatschap',[
    ['1560699777509752894','Dispatch selectie','opleiding'],
    ['1309532438019706963','Dispatch']]),
  ...make('dispatch','specialisatie', [['1393050971604516904','Dispatch-instructeur']]),
  ...make('depannage','lidmaatschap',[
    ['1309532438019706971','LSRA'],['1309532438019706970','FAST'],['1309532438019706969','AWV']]),
  ...make('burger','lidmaatschap',[
    ['1398985105254650007','Burger-IO','opleiding'],['1309532438019706966','Burger'],
    ['1492485336197234728','Burgerraad']]),
  ...make('brandweer','lidmaatschap',[
    ['1309532438053130324','Brandweer'],['1554906632897560787','BW middenkader'],
    ['1395115819020714105','BW leiding'],['1368971465612984371','BW interesse','interesse']]),
  ...make('brandweer','specialisatie',[
    ['1309532437952466986','BW log/signa'],['1399000349037166664','Ladderwagen'],
    ['1399006120965570670','Bosbestrijding'],['1309532437952466985','Duiker'],
    ['1399000449457197188','RED-team'],['1309532437952466987','Adviseur gevaarlijke stoffen'],
    ['1466508322566967609','BW_AMBU']]),
  ...make('ambulance','lidmaatschap',[
    ['1309532438053130323','Ambulance'],['1309532437977497697','AMBU rang'],
    ['1368971738834272356','AMBU interesse','interesse']]),
  ...make('ambulance','specialisatie',[
    ['1309532437977497696','Verpleegkundige'],['1360990854445137980','MIP'],
    ['1360990813357609181','MUGHELI'],['1309532437952466988','Medisch instructeur'],
    ['1309532437977497695','Arts'],['1309532438053130325','AZLS']]),
  ...make('algemeen','ondersteuning',[
    ['1392989523104895168','Ticket-support'],['1309532438019706967','Comm-helper'],
    ['1309536724463910924','Server booster'],['1311383517103657030','Gewaardeerd lid'],
    ['1309532438053130328','Persdienst'],['1430681371386319008','Social media'],
    ['1492892729426972744','Pers-leiding'],['1309532438053130329','Developer'],
    ['1431761566734225554','Monitor'],['1558419160969510913','Event'],
    ['1558419118879801375','Event organisatie'],['1512779233099907092','Hall of Ping'],
    ['1560418130252005507','Hall of Shame'],['1471930509062967417','Hall of Fame'],
    ['1558147172204281890','Burgermelding ping'],['1315334316347363429','Streamer'],
    ['1437176141659111656','Radio-opleiding'],['1309532438053130327','Donateur'],
    ['1309532437952466991','Beta-tester'],['1309532438053130330','Team']]),
  // Een afzonderlijke Discord-bestuursrol, zonder operationele kadermachtiging.
  ...make('algemeen','bestuursfunctie', [['1309532438082355251','Bestuur']])
]);
export const KNOWN_ROLE_IDS=new Set(ROLE_CATALOG.map(r=>r.id));
const byId=new Map(ROLE_CATALOG.map(r=>[r.id,r]));
export function recognizeRoles(roleIds){
  if(!Array.isArray(roleIds))return [];
  return [...new Set(roleIds)].map(id=>byId.get(id)).filter(Boolean);
}
export function roleSummary(roleIds){
  const roles=recognizeRoles(roleIds);
  const depts=[...new Set(roles.filter(r=>r.dept!=='algemeen'&&r.stage!=='interesse').map(r=>r.dept))];
  const police=new Set(roles.filter(r=>r.dept==='politie').map(r=>r.id));
  const rank=police.has('1353670078142615592')?'korpsleiding'
    :police.has('1473474238664020151')?'officierenkader'
    :police.has('1335578488664490057')?'middenkader'
    :police.has('1351212180120408166')?'basiskader':null;
  return {roles,departments:depts,policeRank:rank,unknownCount:Array.isArray(roleIds)?roleIds.filter(id=>!KNOWN_ROLE_IDS.has(id)).length:0};
}
export function isInstructorForDept(roles,dept){
  const names={politie:['Motard-instructeur','K9-instructeur','RAGO-instructeur','AE-instructeur'],
    dispatch:['Dispatch-instructeur'],ambulance:['Medisch instructeur']};
  return roles.some(r=>r.dept===dept && names[dept]?.includes(r.name));
}
