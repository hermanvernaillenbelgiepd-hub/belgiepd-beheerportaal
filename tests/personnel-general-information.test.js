import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {canEditGeneralPersonnelInfo} from '../src/personnel-editor-policy.js';
import {canMaintainStaffDossier} from '../src/staff-dossier-policy.js';

const person={dept:'politie',personId:'123456789012345678',name:'Test Medewerker',call:'SANTO-280',rank:'Agent van Politie (AP)',status:'Actief'};
const officer={discordId:'223456789012345678',role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},dossierAllowedDepartments:['politie'],
  dossierNativeDepartments:['politie']};
const corps={...officer,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'}};
const middle={...officer,role:'middenkader',departmentRoles:{politie:'middenkader'}};
const board={discordId:'323456789012345678',boardPersonnelAdmin:true,role:'basiskader',
  departments:[],departmentRoles:{},dossierAllowedDepartments:['politie'],
  dossierNativeDepartments:[]};

test('Algemene personeelsinformatie is alleen schrijfbaar door bevoegd Officierenkader, Korpsleiding of geverifieerd Bestuur',()=>{
  for(const actor of [officer,corps,board]){
    assert.equal(canEditGeneralPersonnelInfo(actor,person),true);
    assert.equal(canMaintainStaffDossier(actor,person),true);
  }
  assert.equal(canEditGeneralPersonnelInfo(middle,person),false);
  assert.equal(canMaintainStaffDossier(middle,person),false);
  assert.equal(canEditGeneralPersonnelInfo({...board,boardPersonnelAdmin:false},person),false);
  assert.equal(canEditGeneralPersonnelInfo({...board,dossierAllowedDepartments:[]},person),false);
  assert.equal(canEditGeneralPersonnelInfo({...board,discordId:person.personId},person),false);
  assert.equal(canEditGeneralPersonnelInfo({...officer,departments:['ambulance']},person),false);
  assert.equal(canEditGeneralPersonnelInfo({...officer,role:'basiskader'},person),false);
});
test('BESTUUR schrijfrecht is beperkt tot algemene fiche en bewaakt disciplinegrens',()=>{
  const ambulance={...person,dept:'ambulance'};
  assert.equal(canEditGeneralPersonnelInfo(board,ambulance),false);
  assert.equal(canEditGeneralPersonnelInfo({...board,dossierAllowedDepartments:['politie','ambulance']},ambulance),true);
});
test('Beide personeelsroutes gebruiken dezelfde serverpolicy; Middenkader statuswijziging vervalt hier',()=>{
  const personnelRoute=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  const dossierRoute=readFileSync(new URL('../src/staff-dossier-routes.js',import.meta.url),'utf8');
  assert.match(personnelRoute,/canEdit:canEditGeneralPersonnelInfo\(req\.bpd,p\)/);
  assert.match(personnelRoute,/if\(!canEditGeneralPersonnelInfo\(req\.bpd,subject\)\)/);
  assert.match(dossierRoute,/canMaintainStaffDossier\(req\.bpd,staff\)/);
  const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  assert.match(ui,/savePersonnelInfoAll/);
  assert.match(ui,/\$\('staffProfileSave'\)\.hidden=true/);
  assert.match(ui,/\$\('save'\)\.hidden=true/);
  assert.match(ui,/\.addEventListener\('submit',event=>\{/);
  assert.match(ui,/const coreChanged=coreAllowed/);
  assert.match(ui,/const profileChanged=profileAllowed/);
  assert.match(ui,/\/api\/staff-dossiers\//);
  assert.match(ui,/\/api\/personnel\//);
  const inline=ui.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  assert.doesNotThrow(()=>new Script(inline.replace(/^import [^\n]*\n/gm,'')));
});
