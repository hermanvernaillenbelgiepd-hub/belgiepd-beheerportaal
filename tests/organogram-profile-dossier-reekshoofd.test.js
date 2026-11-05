import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {organogramReekshoofdTitle,canLinkPoliceOrganogramDossier,
 policeOrganogramDossierUrl} from '../src/organogram-profile-display.js';

const j={dept:'politie',personId:'344065695635734528',name:'J.Eclaire',
 call:'600',series:'Reeks 3',rank:'Aspirant Hoofdinspecteur van Politie (AHINP)'};
const officer={role:'officierenkader',uid:'discord:987654321012345678',
 discordId:'987654321012345678',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},
 dossierAllowedDepartments:['politie']};

test('middle cadre with a registered series is reekshoofd, otherwise VLINDER',()=>{
 assert.equal(organogramReekshoofdTitle(j),'Reeks 3');
 const yassine={...j,personId:'622486684033875968',call:'700',
  rank:'Hoofdinspecteur van Politie (HINP)',series:'Reeks 1'};
 assert.equal(organogramReekshoofdTitle(yassine),'Reeks 1');
 assert.equal(organogramReekshoofdTitle({...yassine,series:'KADER'}),'VLINDER');
 assert.equal(organogramReekshoofdTitle({...yassine,series:''}),'VLINDER');
 assert.equal(organogramReekshoofdTitle({...yassine,series:'VLINDER'}),'VLINDER');
 assert.equal(organogramReekshoofdTitle({...yassine,series:'02'}),'Reeks 2');
 assert.equal(organogramReekshoofdTitle({...yassine,call:'485',rank:'Inspecteur'}),'');
 assert.equal(organogramReekshoofdTitle({...yassine,dept:'brandweer'}),'');
 assert.equal(organogramReekshoofdTitle({...yassine,personId:'not-valid'}),'');
});
test('dossier button is only offered to approved police officers/corps and only for permitted subject',()=>{
 assert.equal(canLinkPoliceOrganogramDossier(officer,j),true);
 assert.match(policeOrganogramDossierUrl(officer,j),/^\/personeelsbeheer\.html\?fiche=1&dept=politie&discordId=344065695635734528&from=organogram$/);
 for(const role of ['basiskader','middenkader','burger','beheerder']){
  const actor={...officer,role,departmentRoles:{politie:role}};
  assert.equal(canLinkPoliceOrganogramDossier(actor,j),false,role);
  assert.equal(policeOrganogramDossierUrl(actor,j),'');
 }
 assert.equal(canLinkPoliceOrganogramDossier({...officer,uid:'mismatched'},j),false);
 assert.equal(canLinkPoliceOrganogramDossier({...officer,dossierAllowedDepartments:[]},j),false);
 assert.equal(canLinkPoliceOrganogramDossier({...officer,departments:['ambulance']},j),false);
 assert.equal(canLinkPoliceOrganogramDossier(officer,{...j,dept:'ambulance'}),false);
 assert.equal(canLinkPoliceOrganogramDossier(officer,{...j,rank:'Eerste Hoofdcommissaris',call:'900'}),false);
 const corps={...officer,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'},
  discordPoliceRank:'korpsleiding'};
 assert.equal(canLinkPoliceOrganogramDossier(corps,{...j,rank:'Eerste Hoofdcommissaris',call:'900'}),true);
});
test('organogram gives no private ID or dossier shortcut to other readers and hides obsolete notes',()=>{
 const api=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(api,/dossierUrl:policeOrganogramDossierUrl\(_req\.bpd,p\)/);
 assert.match(api,/reekshoofdReeks:organogramReekshoofdTitle\(p\)/);
 assert.match(html,/fact\('Reeksfunctie',p\.reekshoofdReeks==='VLINDER'/);
 assert.match(html,/person-profile-dossier-link/);
 assert.match(html,/url\.searchParams\.get\('dept'\)==='politie'/);
 assert.doesNotMatch(html,/Alle informatie is alleen-lezen/);
 assert.doesNotMatch(html,/Formeel uniform · automatisch weergegeven Belgisch graadteken/);
 assert.doesNotMatch(html,/class="footer"/);
 assert.doesNotMatch(html,/id="selected"/);
});
