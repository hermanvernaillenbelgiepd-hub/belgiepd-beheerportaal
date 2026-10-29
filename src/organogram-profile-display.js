// Presentation-only titles and private dossier shortcuts used by the organogram.
// These titles are confirmed administrative display assignments, not Discord
// authorization roles. Never derive a reekshoofd appointment from "Reeks 3"
// (an education role) or from a callsign.
// Future appointments must be confirmed by the police leadership first.
import {roleForDepartment} from './leave-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';

const VERIFIED_REEKSHOOFD=new Map([
 ['344065695635734528','Reeks 03'] // J.Eclaire: explicitly confirmed by staff
]);
const ID=/^\d{15,22}$/;

export function organogramReekshoofdTitle(person){
 if(person?.dept!=='politie'||!ID.test(String(person.personId||'')))return '';
 return VERIFIED_REEKSHOOFD.get(person.personId)||'';
}

// Only police officers/corps, scoped to the police service and to this
// particular subject. These checks are ADDITIONAL to dossier endpoint guards.
export function canLinkPoliceOrganogramDossier(actor,person){
 if(person?.dept!=='politie'||!ID.test(String(person.personId||''))||
    !actor||actor.uid!=='discord:'+actor.discordId||
    !ID.test(String(actor.discordId||'')))return false;
 const cadre=roleForDepartment(actor,'politie');
 if(!['officierenkader','korpsleiding'].includes(cadre)||
    !['officierenkader','korpsleiding'].includes(actor.role))return false;
 return canReadServiceDossier(actor,'politie')&&canReadPersonnelSubject(actor,person);
}

export function policeOrganogramDossierUrl(actor,person){
 return canLinkPoliceOrganogramDossier(actor,person)
  ?'/personeelsbeheer.html?'+new URLSearchParams({
    fiche:'1',dept:'politie',discordId:person.personId,from:'organogram'
   }).toString()
  :'';
}
