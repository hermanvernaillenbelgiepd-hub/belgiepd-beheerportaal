import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../public/to-dienstbord.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/to-dienstbord.css',import.meta.url),'utf8');

test('TO team card supports two-click response reporting and a separate reset control',()=>{
  for(const marker of [
    "data-action=\"team-response-next\"",
    "case 'team-response-next'",
    "case 'team-response-clear'",
    "command('response-phase',{id,phase})",
    "command('response-phase',{id,phase:null})",
    'data-response-phase=',
    "phase==='onderweg'?'ONDERWEG':'TER PLAATSE'",
    "phase==='onderweg'?'ter plaatse melden':'onderweg melden'",
    "phase==='ter-plaatse'?'Ter plaatse",
    'aria-label=',
    'role="button" tabindex="0"',
    "document.addEventListener('keydown'"
  ])assert.ok(js.includes(marker),marker);
  assert.ok(!js.includes("case 'team-response-next':await command('toggle-team'"));
});

test('TO response beacons blink only while underway and remain visually steady on scene',()=>{
  for(const marker of [
    '.response-indicator[data-phase="onderweg"] .response-light',
    'animation:to-blue-response-flash',
    '.response-indicator[data-phase="ter-plaatse"] .response-light',
    '@keyframes to-blue-response-flash',
    '@media(prefers-reduced-motion:reduce)',
    '.team-card-body.team-response-clickable:focus-visible',
    '.team-actions .response-reset'
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
