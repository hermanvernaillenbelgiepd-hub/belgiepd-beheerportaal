// Audited display-only image selections for one exact Discord account and specialty.
import {createHash} from 'node:crypto';
import {allSpecialtyLabels} from './specialization-policy.js';
export const PERSON_SPECIALTY_PATCH_COLLECTION='bpd_person_specialty_artwork';
export const PERSON_SPECIALTY_PATCH_DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
export const PERSON_SPECIALTY_ASSET=/^(rank|uniform|specialty|patch|helmet|profession|logo|pictogram)_(politie|brandweer|ambulance|depannage)_[a-z0-9][a-z0-9_]{0,39}$/;
const idOK=id=>/^\d{15,22}$/.test(String(id||''));
export const personPatchKey=(dept,id,specialty)=>
 dept+'_'+id+'_'+createHash('sha256').update(specialty).digest('hex').slice(0,20);
export function validatePersonSpecialtyPatch(body,additional=[],remove=false){
 if(!body||Array.isArray(body)||typeof body!=='object'||
    Object.keys(body).some(x=>!['department','personId','specialty','sourceArtworkKey','reason'].includes(x)))
  throw Error('Ongeldige persoonsgebonden patchkoppeling');
 const department=String(body.department||''),personId=String(body.personId||'').trim(),
  specialty=String(body.specialty||''),sourceArtworkKey=String(body.sourceArtworkKey||''),
  reason=String(body.reason||'').trim();
 const source=PERSON_SPECIALTY_ASSET.exec(sourceArtworkKey);
 if(!PERSON_SPECIALTY_PATCH_DEPTS.includes(department)||!idOK(personId)||
    !allSpecialtyLabels(department,additional).includes(specialty)||
    reason.length<8||reason.length>300||/[\x00-\x1f\x7f<>]/.test(reason)||
    (!remove&&(!source||source[2]!==department))||
    (remove&&sourceArtworkKey))
  throw Error('Kies een bestaand personeelslid, een specialisatie en een afbeelding van dezelfde dienst');
 return {key:personPatchKey(department,personId,specialty),department,personId,
   specialty,sourceArtworkKey,reason};
}
export function overlayPersonalSpecialtyArtwork(patches,person,merged,personalLinks,assetUrls,normalize){
 const out=Array.isArray(patches)?[...patches]:[];
 if(!person||!merged||!Array.isArray(personalLinks))return out;
 const active=new Set((merged.specialties||[]).map(label=>normalize(person.dept,label)));
 for(const entry of personalLinks){
  if(entry?.department!==person.dept||entry?.personId!==person.personId||
     entry.active!==true||typeof entry.specialty!=='string')continue;
  const label=normalize(person.dept,entry.specialty),imageUrl=assetUrls.get(entry.sourceArtworkKey);
  if(!active.has(label)||!imageUrl)continue;
  const index=out.findIndex(x=>normalize(person.dept,x.label)===label);
  const before=index>=0?out[index]:{label,level:'',roleId:''};
  const next={...before,label,imageUrl,source:'person'};
  if(index>=0)out[index]=next;
  else if(out.length<20)out.push(next);
 }
 return out.slice(0,20);
}
