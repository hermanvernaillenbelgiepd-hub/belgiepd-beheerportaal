import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directoryStatusKind,activeDirectorySpecialties,filterCompactDirectory,
 directorySeriesOptions} from '../public/personnel-compact-policy.js';
import {mountCompactPersonnelDirectory} from '../public/personnel-compact-ui.js';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const person=(call,name,series,status,specialties=[])=>({
 hasPoliceEntry:true,call,name,series,status,rank:'Agent',
 services:['Politie'],specialties
});
test('alleen bestaande, positieve specialisatiestatussen komen in de compacte badge-overzicht',()=>{
 const p=person('275','Voorbeeld','3','Actief',[
  {label:'INTERVENTIEDIENST',value:'Ja'},{label:'Motor',value:'Stage'},
  {label:'AE',value:'AE-T'},{label:'K9',value:'Nee'},
  {label:'TO',value:'Niet ingevuld'},{label:'RAGO',value:'Restricted'}
 ]);
 assert.deepEqual(activeDirectorySpecialties(p),['Interventie','Motard','AE']);
 assert.deepEqual(activeDirectorySpecialties({...p,hasPoliceEntry:false}),[]);
});
test('statuskleuren veranderen de bestaande personeelsstatus niet',()=>{
 assert.equal(directoryStatusKind('Actief'),'active');
 assert.equal(directoryStatusKind('Verlof'),'leave');
 assert.equal(directoryStatusKind('Inactief'),'inactive');
 assert.equal(directoryStatusKind('50/50'),'warning');
 assert.equal(directoryStatusKind('Verwijderd'),'muted');
 assert.equal(directoryStatusKind('BANNED'),'muted');
 assert.equal(directoryStatusKind('Afwezig'),'neutral');
});
test('filters werken uitsluitend op reeds zichtbare directoryvelden',()=>{
 const items=[
 person('270','Marie','2','Inactief',[{label:'K9',value:'Ja'}]),
 person('275','Pablo','3','Actief',[{label:'AE',value:'Ja'}]),
 {...person('—','Jean','—','Nog geen politie-inschrijving'),hasPoliceEntry:false,
  services:['Depannage']}
 ];
 assert.equal(filterCompactDirectory(items,{department:'Politie'}).length,2);
 assert.equal(filterCompactDirectory(items,{department:'Depannage'}).length,1);
 assert.deepEqual(filterCompactDirectory(items,{series:'3'}).map(x=>x.name),['Pablo']);
 assert.deepEqual(filterCompactDirectory(items,{status:'active'}).map(x=>x.name),['Pablo']);
 assert.deepEqual(filterCompactDirectory(items,{query:'k9'}).map(x=>x.name),['Marie']);
 assert.deepEqual(filterCompactDirectory(items,{query:'depannage'}).map(x=>x.name),['Jean']);
 assert.deepEqual(directorySeriesOptions(items),['2','3']);
});
test('vier tabbladen, subbeheer en bestaande uitklapbare detailtabel blijven aanwezig',()=>{
 const html=file('public/personeelsbeheer.html');
 const publicUi=file('public/personnel-compact-ui.js');
 const css=file('public/personnel-compact.css');
 for(const id of ['personnelPublicTab','personnelSeriesTab',
  'personnelSpecialtiesTab','personnelManageTab'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('id="personnelManageSubnav"'));
 assert.ok(html.includes('id="personnelGroupSettingsTab"'));
 assert.ok(html.includes('id="personnelCompactRoot"'));
 assert.ok(html.includes("mountCompactPersonnelDirectory({"));
 assert.ok(html.includes("request('/api/member/personnel-list'"));
 assert.ok(html.includes('personnelCompactViews.activate()'));
 assert.ok(html.includes("cardDialog.show();"));
 assert.ok(html.includes('personnelCompactViews.reset()'));
 assert.ok(publicUi.includes("frame.id='personnelDirectoryFrame'"));
 assert.ok(publicUi.includes("frame.src='/personeelslijst.html?embed=1'"));
 assert.ok(publicUi.includes("fetchPersonnel(text)"));
 assert.ok(publicUi.includes('openPerson(String(person.call),String(person.name))'));
 assert.ok(css.includes('personnelCardDialog'));
 assert.ok(css.includes('pc-specialties'));
 assert.equal(typeof mountCompactPersonnelDirectory,'function');
});
test('aanmeldcontrole en privacybescherming van de oude directory blijven gelden',()=>{
 const route=file('src/member-dashboard-routes.js');
 const html=file('public/personeelsbeheer.html');
 assert.ok(route.includes("app.get('/api/member/personnel-list',memberIdentity"));
 assert.ok(route.includes('never expose Discord IDs in the directory JSON'));
 assert.ok(html.includes('const id=matches.length===1?'));
 assert.ok(html.includes("const personnelGroupedViews=mountPersonnelGroupedViews"));
 assert.ok(html.includes("const personnelGroupSettingsEditor=mountPersonnelGroupSettingsEditor"));
});
