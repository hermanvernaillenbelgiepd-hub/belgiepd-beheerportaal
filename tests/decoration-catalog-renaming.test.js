import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATALOG_BY_ID,catalogLabelOverrideItem,decorationCatalogExtras,
 lookupCatalog,publicDecorations,manageDecorations,canRenameDecorationCatalog,
 canManagePoliceDecorationCatalog} from '../src/personnel-decoration-policy.js';

const custom='custom_12345678-1234-4234-8234-123456789abc';
const doc=(id,data)=>({id,data:()=>data});

test('predefined medal rename changes the display name but never its stable ID or kind',()=>{
 const id='dienstmedaille_goud';
 const renamed=catalogLabelOverrideItem(doc(id,{label:'Medaille voor bijzondere verdienste'}));
 assert.equal(renamed.id,id);
 assert.equal(renamed.kind,CATALOG_BY_ID.get(id).kind);
 assert.equal(renamed.label,'Medaille voor bijzondere verdienste');
 assert.equal(CATALOG_BY_ID.get(id).label,'Gouden dienstmedaille');
 for(const label of ['', 'a','<> hack','x'.repeat(81)]){
  assert.equal(catalogLabelOverrideItem(doc(id,{label})),null);
 }
 assert.equal(catalogLabelOverrideItem(doc('unknown',{label:'Een nieuwe medaille'})),null);
});

test('renamed built-in and custom catalogue items persist in public personnel card and manager',()=>{
 const extras=decorationCatalogExtras([
  doc('dienstmedaille_goud',{label:'Gouden verdienstemedaille'}),
  doc(custom,{id:custom,label:'Eerbewijs van de dienst',kind:'medal',color:'gold',priority:150}),
  doc('invalid_doc',{label:'geen onderscheiding'})
 ]);
 assert.equal(extras.size,2);
 const award={catalogId:'dienstmedaille_goud',startDate:'2026-11-01',endDate:null,public:true};
 const customAward={...award,catalogId:custom};
 assert.equal(lookupCatalog('dienstmedaille_goud',extras).label,'Gouden verdienstemedaille');
 assert.equal(publicDecorations([award,customAward],'2026-11-04',extras)[0].label,'Gouden verdienstemedaille');
 assert.equal(manageDecorations([award,customAward],'2026-11-04',extras)[0].label,'Eerbewijs van de dienst');
 assert.equal(publicDecorations([{...award,public:false}],'2026-11-04',extras).length,0);
 assert.equal(publicDecorations([{...award,revokedAt:'2026-11-02'}],'2026-11-04',extras).length,0);
});

test('rename route requires verified officer/corps, audit reason and preserves grants',()=>{
 const server=readFileSync(new URL('../src/personnel-decoration-routes.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/assets/organogram-decorations.js',import.meta.url),'utf8');
 assert.match(server,/app\.patch\('\/api\/personnel-awards\/catalog-label\/:id',requireUser/);
 assert.match(server,/canManagePoliceDecorationCatalog\(req\.bpd\)/);
 assert.match(server,/bpd_personnel_decoration_catalog_audit/);
 assert.match(server,/reason\.length<10/);
 assert.match(server,/tx\.set\(ref,\{id,label,updatedAt:/);
 assert.doesNotMatch(server,/tx\.delete\(/);
 assert.match(ui,/Naam van een medaille of ereteken wijzigen/);
 assert.match(ui,/bpd-decoration-renamed/);
});

test('technical beheer can rename but cannot grant or upload awards',()=>{
 const technical={uid:'discord:222222222222222222',discordId:'222222222222222222',
  role:'beheerder',portalTechnicalMode:true,profileTechnicalAvailable:true,
  departments:['politie'],dossierAllowedDepartments:['politie']};
 assert.equal(canRenameDecorationCatalog(technical),true);
 assert.equal(canManagePoliceDecorationCatalog(technical),false);
 assert.equal(canRenameDecorationCatalog({...technical,profileTechnicalAvailable:false}),false);
 assert.equal(canRenameDecorationCatalog({...technical,uid:'google:222222222222222222'}),false);
 const routes=readFileSync(new URL('../src/personnel-decoration-routes.js',import.meta.url),'utf8');
 assert.match(routes,/canRename:canRenameDecorationCatalog\(req\.bpd\)/);
 assert.match(routes,/if\(!canRenameDecorationCatalog\(req\.bpd\)\)/);
 assert.match(routes,/if\(!canManagePoliceDecorationCatalog\(req\.bpd\)\)/);
});
