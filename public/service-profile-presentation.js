// Service-specific labels and patch visuals; presentation-only, no role grants.
const val=x=>String(x??'').trim();
export function serviceProfileRank(person){
 const rank=val(person?.rank);
 if(person?.dept!=='depannage')return rank||'Rang niet geregistreerd';
 const call=val(person?.call).toUpperCase().replace(/\s+/g,'');
 const normalized=rank.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/^(?:AWV|ANWV)-?\d{1,4}$/.test(call)||/^(?:agentschap wegen (?:en|&) verkeer|awv)(?:\s|$)/.test(normalized))
  return 'Leiding · Agentschap Wegen en Verkeer';
 if(/^(?:FAST|F\.A\.S\.T\.?)-?\d{1,4}$/.test(call))return 'F.A.S.T.-medewerker';
 if(/^LSRA-?\d{1,4}$/.test(call))return 'LSRA-medewerker';
 if(/^(?:depannage|depannagetechnicus|takelaar|takeltechnicus|wegenwerker|technicus|kraanmachinist|operationeel lid|leiding)(?:\b|\s)/.test(normalized))
  return rank;
 return 'Operationeel lid Depannage';
}
const codes=Object.freeze({fast:'fast',lsra:'lsra',lrsa:'lsra',crane:'crane',
 wegenwerken:'wegenwerken',signalisatie:'signalisatie'});
const normalize=x=>val(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]/g,'');
export const depannagePatchCode=label=>codes[normalize(label)]||'';
// Only a dedicated uploaded patch-badge for the SAME service may replace a
// built-in insignia. Old role/uniform photographs are not valid patch fallbacks.
export function depannageProfilePatch(label,linked=[]){
 const code=depannagePatchCode(label);
 if(!code)return '';
 // A qualification may use a specifically uploaded same-service PATCH.
 // Legacy generic specialty photographs never count as embroidered patches.
 const prefix='/api/role-artwork/file/patch_depannage_'+code;
 const suffix=/^(?:|_(?:badge|geborduurd|lokaal|federaal|badge_lokaal|badge_federaal))\?v=[a-zA-Z0-9-]+$/;
 const arr=Array.isArray(linked)?linked:[];
 const approved=arr.find(x=>depannagePatchCode(x?.label)===code&&
  typeof x.imageUrl==='string'&&x.imageUrl.startsWith(prefix)&&
  suffix.test(x.imageUrl.slice(prefix.length)));
 return approved?.imageUrl||'/assets/bpd-depannage-'+code+'-patch.svg';
}
