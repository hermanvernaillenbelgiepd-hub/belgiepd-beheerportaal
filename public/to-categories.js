const service=(id,label,categories)=>Object.freeze({id,label,categories:Object.freeze(categories)});

// Operational labels describe crews; they never grant department access.
export const TO_SERVICE_GROUPS=Object.freeze([
  service('politie','Politie',[
    'SANTO','BLAINE','WYCAN','FALCON','EAGLE','SIGMA','SIGNA','MARCAN','AIRCAN','CANINE','RAGO','MIKE','COMMAND'
  ]),
  service('brandweer','Brandweer',['BRANDWEER','BWM','BWV','KORP','SERG','ADJ','LT','KAP','MAJ','KOL','ZONE','ZONE-COMM','PLOEG1','PLOEG2','PLOEG3']),
  service('ambulance','Ambulance',['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB','AMBULANCE','AMBULANCE-MOTOR','PIT','MUG','MUGHELI','DIR-MED','SIT-TEAM']),
  service('depannage','Depannage',['LSRA','DEPK','LSRA-DEPA100','LSRA-DEPAK200','LSRA-F.A.S.T.','LSRA-ANWV']),
  service('overige','Overige',[])
]);

export const TO_CATEGORIES=Object.freeze(TO_SERVICE_GROUPS.flatMap(group=>group.categories));
const categoryServices=new Map(TO_SERVICE_GROUPS.flatMap(group=>group.categories.map(category=>[category,group])));
const other=TO_SERVICE_GROUPS.find(group=>group.id==='overige');

export function serviceForCategory(category){
  const normalized=typeof category==='string'?category.trim().toUpperCase():'';
  return categoryServices.get(normalized)||other;
}

export function groupByTOService(items,categoryOf=item=>item?.category){
  const grouped=new Map();
  for(const item of items||[]){
    const group=serviceForCategory(categoryOf(item));
    if(!grouped.has(group.id))grouped.set(group.id,[]);
    grouped.get(group.id).push(item);
  }
  return TO_SERVICE_GROUPS.filter(group=>grouped.has(group.id))
    .map(group=>({...group,items:grouped.get(group.id)}));
}
