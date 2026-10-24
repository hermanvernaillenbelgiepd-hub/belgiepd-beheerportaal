import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const root=new URL('../public/',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('Toegangsvoorbeeld biedt vijf fictieve profielen zonder echte aanmeldgegevens',()=>{
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
  for(const role of ["Volledig nieuw lid","Basiskader","Middenkader","Officierenkader","Korpsleiding"])
    assert.ok(js.includes("label:'"+role+"'"),role);
  assert.match(js,/call:'300'/);
  assert.match(js,/call:'730'/);
  assert.match(js,/call:'930'/);
  assert.match(js,/call:'910'/);
  assert.match(js,/roles\.indexOf\(role\)/);
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
  assert.match(js,/Korpsleidingleden zoals 900 en 910 blijven in de lijst zichtbaar/);
  const profile=readFileSync(new URL('../src/portal-profile-mode.js',import.meta.url),'utf8');
  assert.match(profile,/eligibleForTechnicalProfile/);
  assert.match(profile,/technicalCookieIsValid/);
});
