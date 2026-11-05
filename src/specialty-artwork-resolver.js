// Pure, presentation-only selection of specialisation patches.
// These keys never assign Discord roles, qualifications or access rights.
const DISCORD_ID=/^\d{15,22}$/;
export function roleArtworkCandidateKeys(link){
 const roleId=String(link?.roleId||'');
 if(!DISCORD_ID.test(roleId))return [];
 const status=String(link?.value||'');
 const variant=status==='INSTRUCTEUR'?'instructeur':
  status==='LEIDING'?'teamleader':
  ['Stage','AANGEMELD'].includes(status)?'in_opleiding':'volwaardig';
 return [...new Set([roleId+'_'+variant,roleId+'_standard'])];
}
export function resolveSpecialtyArtworkKey(link,availableKeys,genericKeys=[],
 {allowRoleFallback=true}={}){
 const has=key=>typeof key==='string'&&key.length>0&&availableKeys?.has(key)===true;
 if(has(link?.assetKey))return link.assetKey;
 const candidates=allowRoleFallback?roleArtworkCandidateKeys(link):[];
 return [...candidates,...genericKeys].find(has)||'';
}

/** Explicit AZLS artwork may decorate an already registered qualification
 * when its Discord role is absent. Never create a qualification or role. */
export function registeredAzlsPatchEligible(label,registered,link,key,available){
 if(!(registered instanceof Set)||!registered.has(label)||
   link?.label!==label||!available?.has(key))return false;
 if(!/^(?:rank|uniform|specialty|patch|helmet|profession|logo|pictogram)_ambulance_[a-z0-9][a-z0-9_]{0,39}$/.test(key))
  return false;
 // Never re-use an instructor / trainee specific role badge as a generic.
 if(/(?:in opleiding|stage|teamleader)/i.test(String(link.level||'')))return false;
 return true;
}
