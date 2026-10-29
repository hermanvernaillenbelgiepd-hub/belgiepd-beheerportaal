// K9 presentation only; never grants training, rank or dossier permissions.
import {roleForDepartment} from './leave-policy.js';
export const K9_ROLE_COLLECTION='bpd_organogram_k9_display_roles';
export const K9_ROLE_VALUES=Object.freeze(['','instructeur','geleider','geleider_in_stage']);
export const K9_ROLE_IDS=Object.freeze({
 instructeur:'1345302115689431061',
 geleider:'1309532437977497699',
 geleider_in_stage:'1345297414612979713'
});
const ID=/^\d{15,22}$/;
export function canEditK9Display(actor){
 if(!actor||typeof actor.uid!=='string'||!actor.uid||!ID.test(String(actor.discordId||''))||
  actor.uid!=='discord:'+actor.discordId)return false;
 return ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'));
}
export function verifiedK9DisplayRole(identity,guildId,now=Date.now()){
 if(!identity||!ID.test(String(guildId||''))||identity.guildId!==guildId||
  !Array.isArray(identity.roleIds)||identity.roleIds.some(id=>!ID.test(String(id)))||
  !Number.isSafeInteger(identity.verifiedAt)||identity.verifiedAt>now+60000||
  now-identity.verifiedAt>7*86400000)return '';
 const roles=new Set(identity.roleIds);
 // K9-instructeur gaat voor stagiair, daarna volwaardige K9-geleider.
 if(roles.has(K9_ROLE_IDS.instructeur))return 'instructeur';
 if(roles.has(K9_ROLE_IDS.geleider_in_stage))return 'geleider_in_stage';
 if(roles.has(K9_ROLE_IDS.geleider))return 'geleider';
 return '';
}
export function validManualK9Role(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['role','reason'].includes(k)))throw Error('Ongeldige K9-wijziging');
 const role=String(body.role??'');
 const reason=String(body.reason||'').trim();
 if(!K9_ROLE_VALUES.includes(role))throw Error('Kies een geldige K9-functie');
 if(reason.length<8||reason.length>300)throw Error('Motivering van 8 tot 300 tekens verplicht');
 return {role,reason};
}
export function effectiveK9DisplayRole(override,automatic){
 return K9_ROLE_VALUES.includes(override)&&override?override:
  K9_ROLE_VALUES.includes(automatic)?automatic:'';
}
