// Presentation only. The current subject's authenticated dossier scope is
// determined by the server, not by the color of this banner.
export const DOSSIER_SERVICES=Object.freeze({
 politie:Object.freeze({label:'POLITIE',icon:'🛡️'}),
 brandweer:Object.freeze({label:'BRANDWEER',icon:'🚒'}),
 ambulance:Object.freeze({label:'AMBULANCE',icon:'🚑'}),
 depannage:Object.freeze({label:'DEPANNAGE',icon:'🚛'})
});
export function serviceIdentity(dept){
 return DOSSIER_SERVICES[dept]||{label:'ONBEKENDE HULPDIENST',icon:'⚠️'};
}
export function displayServiceBadge(root,dept,{registration=false}={}){
 const info=serviceIdentity(dept);
 root.className='dossier-service-banner service-'+(DOSSIER_SERVICES[dept]?dept:'unknown')+
   (registration?' service-registration':'');
 root.replaceChildren();
 const icon=document.createElement('span');icon.className='service-icon';
 icon.textContent=info.icon;icon.setAttribute('aria-hidden','true');
 const wording=document.createElement('span');wording.className='service-banner-text';
 const caption=document.createElement('small');
 caption.textContent=registration?'REGISTRATIE VOOR HULPDIENST':'HUIDIG PERSONEELSDOSSIER';
 const label=document.createElement('strong');
 label.textContent=info.label;
 wording.append(caption,label);root.append(icon,wording);
 root.setAttribute('aria-label',(registration?'Registratie voor ':'Dossier van ')+info.label);
}
