// Presentation-only titles and private dossier shortcuts used by the organogram.
// A mid-cadre officer with an explicitly assigned police *personnel* series
// leads that series; a mid-cadre officer without one is a VLINDER. The
// assignment is display metadata only; it never confers additional rights.
import {roleForDepartment} from './leave-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {policeKader} from './normalize.js';

const ID=/^\d{15,22}$/;

export function organogramReekshoofdTitle(person){
 if(person?.dept!=='politie'||!ID.test(String(person.personId||'')))return '';
 const call=String(person.call||'').trim().match(/^(?:[a-z]+[- ]?)?(\d{3})$/i);
 const n=call?Number(call[1]):NaN;
 const isMiddle=(n>=600&&n<900)||
  policeKader(person.rank,person.call)==='Middenkader';
 if(!isMiddle)return '';
 const series=String(person.series||person.seriesRaw||'').trim();
 const match=series.match(/^(?:reeks\s*)?0*([1-9]\d?)$/i);
 return match?'Reeks '+Number(match[1]):'VLINDER';
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
