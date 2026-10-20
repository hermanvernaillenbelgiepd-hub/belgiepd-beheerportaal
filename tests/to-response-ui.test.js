import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../public/to-dienstbord.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/to-dienstbord.css',import.meta.url),'utf8');

test('TO card uses distinct buttons rather than a full-card click surface',()=>{
  for(const marker of [
    'statusButton('↗ Onderweg','team-response-underway'',
    'statusButton('● Ter plaatse','team-response-on-scene'',
    'statusButton('Ⅱ Pauze / NB','team-pause'',
    'statusButton('✓ Beschikbaar','team-available'',
    'statusButton('↺ Status wissen','team-response-clear'',
    "case 'team-response-underway':case 'team-response-on-scene':",
    "case 'team-pause':case 'team-available':",
    "case 'team-response-clear':",
    "command('response-phase',{id,phase})",
    "command('response-phase',{id,phase:null})",
    "command('toggle-team',{id,available})",
    "const phaseControls=editable?",
    'data-response-phase=',
    "phase==='onderweg'?'ONDERWEG':'TER PLAATSE'",
    'role="group"',
    "aria-pressed="
  ])assert.ok(js.includes(marker),marker);
  assert.ok(!js.includes('data-action="team-response-next"'),'Entire card no longer changes phase');
});

test('TO response beacons blink only while underway and remain visually steady on scene',()=>{
  for(const marker of [
    '.response-indicator[data-phase="onderweg"] .response-light',
    'animation:to-blue-response-flash',
    '.response-indicator[data-phase="ter-plaatse"] .response-light',
    '@keyframes to-blue-response-flash',
    '@media(prefers-reduced-motion:reduce)',
    '.crew-quick-controls',
    '.crew-quick-button'
  ])assert.ok(css.includes(marker),marker);
  // Stage indication is readable as text, even when motion is disabled.
  assert.ok(js.includes('Onderweg, blauw licht knippert'));
  assert.ok(js.includes('Ter plaatse, blauw licht blijft branden'));
});

test('Existing eight incident shortcuts remain; extra common ones are behind an accessible expansion',()=>{
  const base=['ANPR','AGRESSIE','VKO','BRAND','TAKELING','DIEFSTAL','VERDACHTE SITUATIE','MEDISCHE BIJSTAND'];
  const extra=['OVERLAST','WONINGINBRAAK','VECHTPARTIJ','VERMIST PERSOON','ACHTERVOLGING','VERDACHT VOERTUIG','VERKEERSHINDER','BEROVING'];
  for(const title of [...base,...extra])assert.ok(js.includes("'"+title+"'"),title);
  assert.ok(js.includes('data-action="incident-presets-toggle"'));
  assert.ok(js.includes('aria-expanded='));
  assert.ok(js.includes('INCIDENT_EXTRA_PRESETS].includes(target.dataset.template)'));
  assert.ok(js.includes("incidentForm('',target.dataset.template)"));
});

test('User-defined incident shortcuts persist and can be reused or deleted',()=>{
  for(const marker of [
    'async function refreshShortcuts()',
    'async function changeShortcut(action,data={})',
    "'/api/to/incident-shortcuts'",
    "case 'save-incident-shortcut':",
    "case 'save-incident-shortcut-detail':",
    "case 'custom-incident-template':",
    "case 'remove-incident-shortcut':",
    "★ Titel als sneltoets opslaan",
    "Alleen de titel wordt bewaard",
    'Opgeslagen sneltoetsen',
    '.saved-presets',
    '.saved-preset-delete'
  ])assert.ok(js.includes(marker)||css.includes(marker),marker);
});
