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
 assert.deepEqual(directorySeriesOptions(items),['1','2','3']);
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
 assert.ok(html.includes('id="personnelDirectoryFrame"'));
 assert.ok(html.includes('src="/personeelslijst.html?embed=1"'));
 assert.ok(html.includes('id="personnelOriginalDirectory"'));
 assert.ok(html.includes("mountCompactPersonnelDirectory({"));
 assert.ok(html.includes("request('/api/member/personnel-list'"));
 assert.ok(html.includes('personnelCompactViews.activate()'));
 assert.ok(html.includes("cardDialog.show();"));
 assert.ok(html.includes('personnelCompactViews.reset()'));
 assert.ok(publicUi.includes("frame.id='personnelLegacyDirectoryFrame'"));
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

test('dienstleiding ziet uitsluitend door de server toegelaten dienstrecords en niet hun Discord-ID',async()=>{
 const {scopedServiceDirectory}=await import('../public/personnel-compact-policy.js');
 const raw=[
  {dept:'politie',name:'Agent',call:'280',rank:'Agent',status:'Actief',
   series:'Reeks 1',discordId:'123456789012345678',hours:320,
   notes:'privé',specialties:[{label:'K9',value:'Ja'}]},
  {dept:'ambulance',name:'Arts',call:'ARTS-01',rank:'Arts',status:'Actief',
   discordId:'923456789012345678',lastConnection:'privé'},
  {dept:'brandweer',name:'Brandweer',call:'STAG-02',rank:'Stagiair',status:'Stage'}
 ];
 const own=scopedServiceDirectory(raw,['ambulance']);
 assert.equal(own.length,1);assert.equal(own[0].name,'Arts');
 assert.equal(own[0].rank,'Arts');
 assert.equal(own[0].hasPoliceEntry,false);
 assert.deepEqual(own[0].services,['Ambulance']);
 assert.equal(JSON.stringify(own).includes('discordId'),false);
 assert.equal(JSON.stringify(own).includes('lastConnection'),false);
 assert.equal(JSON.stringify(own).includes('hours'),false);
 assert.deepEqual(scopedServiceDirectory(raw,['burger']),[]);
});
test('personeelslijst blijft standaard; beheertab opent instellingen, niet onbedoeld een fichebewerking',()=>{
 const html=file('public/personeelsbeheer.html');
 const compact=file('public/personnel-compact-ui.js');
 assert.ok(html.includes("let personnelGroupView='lijst'"));
 assert.ok(html.includes("personnelCompactViews.setScopedPersonnel(people,data.departments||[])"));
 assert.ok(html.includes("personnelCompactViews.setScopedPersonnel([],[])"));
 assert.ok(html.includes("personnelManagementRequested=false;\n personnelGroupView='instellingen';"));
 assert.ok(html.includes("if(publicView&&personnelServiceDirectoryActive)"));
 assert.ok(compact.includes("scope.append(choice('all','Algemene personeelslijst')"));
 assert.ok(compact.includes("choice('service','Personeel van mijn dienst')"));
 assert.ok(compact.includes("seriesLabel.hidden=!allowedDepts.includes('politie')"));
 assert.ok(compact.includes("showAll.textContent=showAllBadges?'Minder specialisaties tonen'"));
 assert.ok(compact.includes("scopeLabel.hidden=!canSee"));
 assert.ok(compact.includes("scope.value='all'"));
});


test('oorspronkelijke lijst is standaard en bevat alle oorspronkelijke specialisatiekolommen',()=>{
 const html=file('public/personeelsbeheer.html'),
  original=file('public/personeelslijst.html'),
  roster=file('public/member-police-roster.js');
 assert.ok(html.includes('id="personnelOriginalDirectory"'));
 assert.ok(html.includes('id="personnelServiceDirectory" hidden'));
 assert.ok(html.includes('id="personnelRosterSeries"'));
 assert.ok(html.includes('id="personnelRosterSeriesLabel"'));
 assert.ok(html.includes('personnelCanViewService=entitled.length>0'));
 assert.ok(html.includes('hasAccess=personnelCanViewService'));
 assert.ok(html.includes("personnelServiceDirectoryActive=false;updatePersonnelServiceMode();"));
 assert.ok(original.includes('renderMemberPoliceRoster('));
 assert.ok(roster.includes('PUBLIC_POLICE_SPECIALTIES'));
 assert.ok(roster.includes("['CALL','RANGKENTEKEN','PERSONEELSLID','REEKS','STATUS']"));
});
test('reeksfilter is uitsluitend 1, 2, 3 en gewone bronstatussen worden niet geïnterpreteerd als reeks',async()=>{
 const html=file('public/personeelsbeheer.html'),
  iframe=file('public/personeelslijst.html'),
  policy=await import('../public/personnel-compact-policy.js');
 const select=html.slice(html.indexOf('id="personnelRosterSeries"'),
  html.indexOf('</select>',html.indexOf('id="personnelRosterSeries"')));
 assert.match(select,/option value="all"/);
 for(const n of [1,2,3])assert.ok(select.includes('option value="'+n+'"'));
 for(const bad of ['4','BANNED','Niet ingevuld','Officierenkader'])
  assert.ok(!select.includes('option value="'+bad+'"'));
 for(const n of [1,2,3]){
  assert.equal(policy.personnelSeriesNumber('Reeks '+n),String(n));
  assert.equal(policy.personnelSeriesNumber(String(n)),String(n));
 }
 for(const value of ['BANNED','Niet ingevuld','Officierenkader / Korpsleiding','4'])
  assert.equal(policy.personnelSeriesNumber(value),null);
 assert.ok(iframe.includes("event.data?.type!=='bpd-directory-series-filter'"));
 assert.ok(iframe.includes("event.source!==window.parent"));
 assert.ok(iframe.includes("event.origin!==location.origin"));
 assert.ok(iframe.includes("['all','1','2','3'].includes(value)"));
 assert.ok(iframe.includes("seriesNumber(p.series)===rosterSeriesFilter"));
});
