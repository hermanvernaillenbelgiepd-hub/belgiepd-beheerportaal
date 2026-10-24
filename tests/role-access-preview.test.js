import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const root=new URL('../public/',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('Toegangsvoorbeeld biedt zeven fictieve profielen zonder echte aanmeldgegevens',()=>{
  const html=read('toegangsvoorbeeld.html');
  const js=read('toegangsvoorbeeld.js');
  const css=read('toegangsvoorbeeld.css');
  assert.doesNotThrow(()=>new Script(js));
  assert.match(html,/Alleen-lezen/);
  assert.match(html,/Geen echte aanmelding of rolwissel/);
  assert.match(html,/id="roleButtons"/);
  assert.match(html,/id="moduleMenu"/);
  assert.match(html,/id="matrixBody"/);
  assert.match(html,/src="\/toegangsvoorbeeld\.js"/);
  assert.match(html,/href="\/gebruikersbeheer\.html"/);
  for(const role of ["Volledig nieuw lid","Agentenkader · tijdelijk","Agentenkader · vast","Basiskader","Middenkader","Officierenkader","Korpsleiding"])
    assert.ok(js.includes("label:'"+role+"'"),role);
  assert.match(js,/call:'300'/);
  assert.match(js,/call:'150'/);
  assert.match(js,/call:'250'/);
  assert.match(js,/call:'700'/);
  assert.match(js,/call:'930'/);
  assert.match(js,/call:'900'/);
  assert.match(js,/CALL 900–999; Discord-rol bepaalt rechten/);
  assert.ok(html.includes('/vast-roepnummer-aanvragen.html'));
  assert.match(js,/const roleIndex=role=>roles\.findIndex\(p=>p\.id===role\.id\)/);
  assert.match(css,/\.experience\{display:grid/);
});

test('Voorbeeld schakelt zonder authenticatie, live data of schrijfacties',()=>{
  const js=read('toegangsvoorbeeld.js');
  assert.doesNotMatch(js,/\bfetch\s*\(/);
  assert.doesNotMatch(js,/\bXMLHttpRequest\b/);
  assert.doesNotMatch(js,/\bWebSocket\b/);
  assert.doesNotMatch(js,/\bgetIdToken\s*\(/);
  assert.doesNotMatch(js,/\bwindow\.location\.assign\s*\(/);
  assert.doesNotMatch(js,/\b(?:localStorage|sessionStorage|document\.cookie)\b/);
  assert.match(js,/roleId=role\.id/);
  assert.match(js,/moduleId=module\.id/);
  assert.match(js,/paintMatrix\(\);draw\(\);/);
  assert.match(js,/er is niets opgeslagen of gewijzigd/);
});

test('Voorbeeld blijft gescheiden van technisch profiel en normale machtigingen',()=>{
  const users=read('gebruikersbeheer.html');
  const html=read('toegangsvoorbeeld.html');
  const js=read('toegangsvoorbeeld.js');
  assert.match(users,/href="\/toegangsvoorbeeld\.html"/);
  assert.ok(users.indexOf('href="/toegangsvoorbeeld.html"')>users.indexOf('<section id="admin"'));
  assert.match(html,/fictieve personen, geen live dossiers/i);
  assert.match(js,/TO-rechten worden apart toegekend/);
  assert.match(js,/Bestuur is geen politierang/);
  assert.match(js,/Korpsleidingleden in de gedeelde 900-reeks blijven in de lijst zichtbaar/);
  const profile=readFileSync(new URL('../src/portal-profile-mode.js',import.meta.url),'utf8');
  assert.match(profile,/eligibleForTechnicalProfile/);
  assert.match(profile,/technicalCookieIsValid/);
});

test('Voorbeeldrijen volgen exacte roepnummers en rangbenamingen zonder rollen te wijzigen',()=>{
  const html=read('toegangsvoorbeeld.html');
  const js=read('toegangsvoorbeeld.js');
  const css=read('toegangsvoorbeeld.css');
  assert.match(html,/id="rankVariants"/);
  assert.match(html,/id="rankVariantButtons"/);
  const variants={
    '300':'A-INP','400':'INP','500':'1-INP',
    '600':'A-HINP','700':'HINP','800':'1-HINP',
    '920':'A-CP','930':'A-CP','900':'1-HCP','910':'1-CP'
  };
  for(const [call,rank] of Object.entries(variants)){
    assert.ok(js.includes("call:'"+call+"',short:'"+rank+"'"),call+' '+rank);
    assert.ok(html.includes(call+' '+rank)||html.includes(call+' ('+rank+')'),call+' '+rank);
  }
  assert.match(js,/const selectedCall=\{basis:'300',midden:'600',officier:'920',korps:'900'\}/);
  assert.match(js,/selectedCall\[roleId\]=variant\.call;draw\(\)/);
  assert.match(js,/paintButtons\(\);paintVariants\(\);paintMenu\(\);paintWorkspace\(\)/);
  assert.match(js,/const roleIndex=role=>roles\.findIndex\(p=>p\.id===role\.id\)/);
  assert.match(js,/return variant\?\{\.\.\.role,\.\.\.variant\}:role/);
  assert.match(css,/\.rank-variants/);
  assert.doesNotMatch(js,/\bfetch\s*\(/);
});
