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
  for(const label of ['Radio BM','RADIO BM',' radio bm ','Radio   BM'])
    assert.equal(api.specialtyIconImage(label),'/assets/icons/radio-bm.svg',label);
  assert.equal(api.specialtyIcon('Radio BM'),'📻','Existing fallback retained');
  assert.equal(api.specialtyIconImage('Radio'),null,'Generic radio specialization unchanged');
  assert.equal(api.specialtyIconImage('Radio BM extra'),null);
  assert.equal(api.specialtyIconImage('Signalisatie'),'/assets/icons/signalisatie.svg');
  assert.equal(api.specialtyIconImage('SIGNALISATIE'),'/assets/icons/signalisatie.svg');
  for(const label of ['SIV/WPR','SIV','WPR','siv/wpr',' SIV / WPR '])
    assert.equal(api.specialtyIconImage(label),'/assets/icons/siv-wpr.svg',label);
  assert.equal(api.specialtyIcon('SIV/WPR'),'🚓');
  assert.equal(api.specialtyIconImage('SIV-overige'),null);
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
test('Both personnel tables retain identity columns and show per-service dynamic specialty headings',()=>{
  const dashboard=source('public/index.html');
  const manager=source('public/personeelsbeheer.html');
  for(const markup of [dashboard,manager]){
    assert.ok(markup.includes('<script src="/personnel-list-visuals.js"></script>'));
    assert.ok(markup.includes('BPDPersonnelVisuals.rankInfo('));
    assert.ok(markup.includes('BPDPersonnelVisuals.specialtyStateFor('));
    assert.ok(markup.includes('BPDPersonnelVisuals.specialtyColumns('));
    assert.ok(markup.includes('href="/bronnen.html"'));
    assert.equal(markup.includes('roster-attribution'),false);
  }
  for(const label of ['Roepnummer','Rangkenteken','Naam van rang',
    'Naam personeelslid','Reeks','Status']){
    assert.ok(dashboard.includes(label),label);
    assert.ok(manager.includes(label),label);
  }
  assert.ok(dashboard.includes('specialty-column'));
  assert.ok(dashboard.includes('specialty-value-cell'));
  assert.ok(dashboard.includes('function employeeTable('));
  assert.ok(dashboard.includes('main portal')===false);
  assert.ok(manager.includes('staffColumnHeaders'));
  assert.ok(manager.includes('specialty-col-head'));
  assert.ok(manager.includes('specialty-status-col'));
  assert.ok(manager.includes('main{max-width:1900px'));
  assert.ok(dashboard.includes('.content:has(.staff-roster)'));
  assert.ok(manager.includes('specialtyEdit'));
  assert.ok(manager.includes('person.series||'));
  assert.ok(manager.includes('person.specialties'));
});
test('User-provided Signalisatie sign is embedded locally and used across both rosters',()=>{
  const svg=source('public/assets/icons/signalisatie.svg');
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.includes('data:image/webp;base64,'));
  assert.ok(svg.length>4000,'Expected a real embedded sign image, not an external URL');
  const manager=source('public/personeelsbeheer.html');
  const dashboard=source('public/index.html');
  assert.ok(manager.includes('function specialtyMark(label)'));
  assert.ok(manager.includes('pict.append(specialtyMark(label))'));
  assert.ok(manager.includes('const icon=specialtyMark(x.label)'));
  assert.ok(dashboard.includes('function specialtyMarkHtml(label)'));
  assert.ok(dashboard.includes('specialtyMarkHtml(label)'));
  assert.ok(manager.includes('.specialty-custom-image'));
  assert.ok(dashboard.includes('.specialty-custom-image'));
});
test('Radio BM uses the supplied transparent Sepura handheld image',()=>{
  const asset=source('public/assets/icons/radio-bm.svg');
  assert.match(asset,/^<svg /);
  assert.match(asset,/aria-label="Sepura portofoon Radio BM"/);
  assert.match(asset,/viewBox="0 0 64 128"/);
  const match=asset.match(/href="data:image\\/webp;base64,([A-Za-z0-9+/=]+)"/);
  assert.ok(match,'Radio BM icon must contain the source image');
  const binary=Buffer.from(match[1],'base64');
  assert.ok(binary.length>2000,'Expected actual optimized radio pixels');
  assert.equal(binary.toString('ascii',0,4),'RIFF');
  assert.equal(binary.toString('ascii',8,12),'WEBP');
  assert.equal(binary.readUInt32LE(4)+8,binary.length,'WebP must be complete');
  assert.ok(asset.trimEnd().endsWith('</svg>'));
  for(const path of ['public/index.html','public/personeelsbeheer.html'])
    assert.ok(source(path).includes('BPDPersonnelVisuals.specialtyIconImage('),path);
});
test('User-provided SIV/WPR car is bundled locally and uses the same reusable icon renderer',()=>{
  const svg=source('public/assets/icons/siv-wpr.svg');
  assert.match(svg,/^<svg /);
  assert.match(svg,/aria-label="Belgische Wegpolitie SIV\/WPR voertuig"/);
  // Zoom in on the front half and side of the supplied image without
  // changing the original raster, other icons, or roster table dimensions.
  assert.match(svg,/viewBox="0 0 72 60"/);
  assert.match(svg,/<image x="0" y="2" width="116" height="56"/);
  const embedded=svg.match(/href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
  assert.ok(embedded,'Expected actual embedded image bytes');
  const bytes=Buffer.from(embedded[1],'base64');
  assert.ok(bytes.length>1800,'The user-supplied vehicle image should not be an empty placeholder');
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'Embedded WEBP must be complete');
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  const dashboard=source('public/index.html'),manager=source('public/personeelsbeheer.html');
  for(const html of [dashboard,manager])assert.ok(html.includes('BPDPersonnelVisuals.specialtyIconImage('));
  assert.ok(source('public/assets/icons/signalisatie.svg').includes('data:image/webp;base64,'));
});
test('All specialization pictograms use centered uniform icon tiles in both roster themes',()=>{
  const light=source('public/index.html'),dark=source('public/personeelsbeheer.html');
  for(const html of [light,dark]){
    assert.ok(html.includes('class="specialty-emoji"')||
      html.includes("mark.className='specialty-emoji'"));
    assert.ok(html.includes('width:40px;height:42px;min-height:42px'));
    assert.ok(html.includes('margin:0 auto 5px'));
    assert.ok(html.includes('width:34px;height:36px'));
    assert.ok(html.includes('specialty-custom-image'));
  }
  assert.ok(dark.includes('.specialty-ledger .specialty-tile>:first-child'));
  assert.ok(light.includes('.specialty-overview-summary .specialty-emoji'));
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
test('Both browser scripts remain valid JavaScript',()=>{
  for(const path of ['public/index.html','public/personeelsbeheer.html']){
    const html=source(path);
    const scripts=[...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length,path);
    for(const m of scripts)assert.doesNotThrow(()=>new Script(m[1]));
  }
});
