import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {permittedDepartmentSanctions,canChooseDepartmentSanction,
  DEPANNAGE_SANCTION_TYPES} from '../src/registrations.js';
import {mayWriteManagement} from '../src/management-utils.js';

test('Depannage sanctions have exactly the four requested measures, with role checks',()=>{
 assert.deepEqual([...DEPANNAGE_SANCTION_TYPES],[
  'Mondelinge waarschuwing','Officiële waarschuwing','Schorsing','Ontslag'
 ]);
 const low=permittedDepartmentSanctions('depannage','middenkader',10);
 const high=permittedDepartmentSanctions('depannage','officierenkader',10);
 const corps=permittedDepartmentSanctions('depannage','korpsleiding',10);
 assert.deepEqual(low,['Mondelinge waarschuwing','Officiële waarschuwing']);
 assert.deepEqual(high,[...low,'Schorsing']);
 assert.deepEqual(corps,[...high,'Ontslag']);
 for(const forbidden of ['Tijdelijke beperking','Degradatie',
    'Voorstel tot degradatie','Ontslag met blacklisting']){
   assert.equal(canChooseDepartmentSanction('depannage','korpsleiding',forbidden,10),false);
 }
 assert.ok(permittedDepartmentSanctions('politie','korpsleiding',10)
   .includes('Degradatie'),'Police sanctions remain unchanged');
});

test('Depannage kan alleen specialisatiebeperking en algemene notitie registreren als management-case',()=>{
 const actor={role:'middenkader',
  departments:['depannage'],departmentRoles:{depannage:'middenkader'},
  dossierAllowedDepartments:['depannage'],dossierNativeDepartments:['depannage']};
 assert.equal(mayWriteManagement(actor,'depannage','specialisatiebeperking'),true);
 assert.equal(mayWriteManagement(actor,'depannage','algemene_notitie'),true);
 for(const type of ['verlof','notitie','opleiding','naamswijziging',
  'promotievoorstel','personeelsbeweging','activiteit']){
  assert.equal(mayWriteManagement(actor,'depannage',type),false,type);
 }
 assert.equal(mayWriteManagement({...actor,departmentRoles:{depannage:'basiskader'}},
  'depannage','specialisatiebeperking'),false);
 const police={...actor,departments:['politie'],
  departmentRoles:{politie:'middenkader'},dossierAllowedDepartments:['politie'],
  dossierNativeDepartments:['politie']};
 assert.equal(mayWriteManagement(police,'politie','notitie'),true,
  'Police management capabilities remain unchanged');
});

test('Depannage houdt zijn drie operationele keuzes plus gewone notities',()=>{
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const start=page.indexOf("if(dept==='depannage'){");
 const end=page.indexOf("  if(formalPermissions?.writesEnabled",start+10);
 assert.ok(start>=0&&end>start,'A Depannage-specific registration branch exists');
 const context=page.slice(start,start+1420);
 assert.match(context,/kinds\.push\(\['observatie','Observatie'\]\)/);
 assert.match(context,/kinds\.push\(\['sanctie','Sanctie'\]\)/);
 assert.match(context,/kinds\.push\(\['case:specialisatiebeperking','Beperking van specialisatie'\]\)/);
 assert.match(context,/kinds\.push\(\['case:algemene_notitie','Algemene notitie'\]\)/);
 assert.match(context,/return kinds/);
 assert.doesNotMatch(context,/kinds\.push\(\['training'/);
});
