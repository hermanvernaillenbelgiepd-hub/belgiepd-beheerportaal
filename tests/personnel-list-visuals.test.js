import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function visuals(){
  const context={window:{}};
  runInNewContext(source('public/personnel-list-visuals.js'),context);
  return context.window.BPDPersonnelVisuals;
}

test('Belgian police operational ranks have correct complete names and genuine local insignia file links',()=>{
  const api=visuals();
  for(const [input,title,file] of [
    ['AP','Agent van politie','AP%20LP.svg'],
    ['Agent','Agent van politie','AP%20LP.svg'],
    ['AINP','Aspirant-inspecteur van politie','AINP%20LP.svg'],
    ['INP','Inspecteur van politie','INP%20LP.svg'],
    ['1INP','Eerste inspecteur van politie','1INP%20LP.svg'],
    ['AHINP','Aspirant-hoofdinspecteur van politie','AHINP%20LP.svg'],
    ['HINP','Hoofdinspecteur van politie','HINP%20LP.svg'],
    ['ACP','Aspirant-commissaris van politie','ACP%20LP.svg'],
    ['CP','Commissaris van politie','CP%20LP.svg'],
    ['HCP','Hoofdcommissaris van politie','HCP%20LP.svg'],
    ['1HCP','Eerste hoofdcommissaris van politie','1HCP%20LP.svg']
  ]){
    const x=api.rankInfo(input,'politie');
    assert.equal(x.label,title,input);
    assert.ok(x.image?.endsWith(file),input);
    assert.match(x.image,/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
  }
  assert.equal(api.rankInfo('Inspecteur','politie').label,'Inspecteur van politie');
  assert.equal(api.rankInfo('Commissaris','politie').label,'Commissaris van politie');
});
test('Do not invent Belgian police insignia for unfamiliar ranks or other services',()=>{
  const api=visuals();
  for(const [rank,dept] of [['Ambulancier','ambulance'],['Inspecteur','brandweer'],
    ['Depanneur','depannage'],['Een onbekende rang','politie']]){
    const info=api.rankInfo(rank,dept);
    assert.equal(info.image,null);
    assert.equal(info.label,rank);
  }
  assert.equal(api.rankInfo('HINP','politie').label,'Hoofdinspecteur van politie');
  assert.equal(api.rankInfo('AINP','politie').label,'Aspirant-inspecteur van politie');
});
test('Specializations pictograms show only positive roster values; status preserved in tooltip',()=>{
  const api=visuals();
  const data=[
    {label:'Motor',value:'Ja'}, {label:'K9',value:'Nee'},
    {label:'Radio BM',value:'Niet ingevuld'}, {label:'Dispatch',value:'Geslaagd'},
    {label:'Signalisatie',value:'x'}, {label:'Motor',value:'Ja'}
  ];
  const result=api.specialtyBadges(data);
  assert.equal(result.length,3);
  assert.equal(result[0].icon,'🏍️');
  assert.equal(result[1].icon,'🎧');
  assert.equal(result[2].icon,'🦺'); // fallback, never displayed while image loads
  assert.equal(api.specialtyIconImage('Signalisatie'),'/assets/icons/signalisatie.svg');
  assert.equal(api.specialtyIconImage('SIGNALISATIE'),'/assets/icons/signalisatie.svg');
  assert.equal(api.specialtyIconImage(' Motor '),null);
  assert.equal(api.specialtyIconImage('Signalisatie-extra'),null);
  assert.equal(result[1].value,'Geslaagd');
  assert.equal(api.qualification('n.v.t.'),false);
  assert.equal(api.qualification('Nee'),false);
  assert.equal(api.qualification('Niet ingevuld'),false);
  assert.equal(api.qualification('In opleiding'),true);
  assert.equal(api.specialtyBadges([],null).length,0);
  assert.equal(api.specialtyBadges([], 'Geen geregistreerde specialisaties').length,0);
});
test('Protected personnel table retains identity, specialization and attribution information',()=>{
  const dashboard=source('public/index.html');
  const manager=source('public/personeelsbeheer.html');
  assert.ok(dashboard.includes('href="/personeelsbeheer.html"'));
  assert.ok(dashboard.includes('href="/bronnen.html"')===false,
    'Dashboard links to modules; source attribution lives in personnel manager');
  for(const symbol of ['BPDPersonnelVisuals.rankInfo(', 'BPDPersonnelVisuals.specialtyStateFor(',
    'BPDPersonnelVisuals.specialtyColumns(', 'BPDPersonnelVisuals.seriesWithCadre('])
    assert.ok(manager.includes(symbol),symbol);
  assert.ok(manager.includes('<script src="/personnel-list-visuals.js"></script>'));
  assert.ok(manager.includes('href="/bronnen.html"'));
  assert.equal(manager.includes('roster-attribution'),false);
  for(const label of ['Roepnummer','Rangkenteken','Naam van rang',
    'Naam personeelslid','Reeks','Status'])assert.ok(manager.includes(label),label);
  assert.ok(manager.includes('specialty-col-head'));
  assert.ok(manager.includes('specialty-status-col'));
  assert.ok(manager.includes('staffColumnHeaders'));
  assert.ok(manager.includes('specialtyEdit'));
  assert.ok(manager.includes('person.series||'));
  assert.ok(manager.includes('person.specialties'));
});

test('User-provided Signalisatie sign remains embedded in the protected personnel list',()=>{
  const svg=source('public/assets/icons/signalisatie.svg');
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.includes('data:image/webp;base64,'));
  assert.ok(svg.length>4000,'Expected embedded sign image, not external URL');
  const manager=source('public/personeelsbeheer.html');
  assert.ok(manager.includes('function specialtyMark(label)'));
  assert.ok(manager.includes('pict.append(specialtyMark(label))'));
  assert.ok(manager.includes('const icon=specialtyMark(x.label)'));
  assert.ok(manager.includes('.specialty-custom-image'));
  const visuals=source('public/personnel-list-visuals.js');
  assert.ok(visuals.includes('function specialtyIconImage(label)'));
});

test('Visual roster credits live on a separate sources page',()=>{
  const page=source('public/bronnen.html');
  assert.ok(page.includes('Politie123'));
  assert.ok(page.includes('CC BY-SA 4.0'));
  assert.ok(page.includes('https://creativecommons.org/licenses/by-sa/4.0/'));
  assert.ok(page.includes('Wikimedia Commons'));
});
test('Personnel overview returns bounded, authorized specialties without copying roles into grants',()=>{
  const api=source('src/personnel-editor-routes.js');
  assert.ok(api.includes("specialties:Array.isArray(p.specialties)?p.specialties.slice(0,16)"));
  assert.ok(api.includes("label:x.label.slice(0,64),value:x.value.slice(0,90)"));
  assert.ok(api.includes("const allowed=req.bpd.departments.filter(d=>canViewPersonnel(req.bpd,d))"));
  assert.equal(/setCustomUserClaims.*specialties/s.test(api),false);
});
test('Personnel management inline script remains valid JavaScript and homepage has no inline scripts',()=>{
  const manager=source('public/personeelsbeheer.html');
  const scripts=[...manager.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length>0,'Personnel manager must contain protected UI logic');
  for(const match of scripts)assert.doesNotThrow(()=>new Script(match[1]));
  assert.equal([...source('public/index.html').matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].length,0);
});
