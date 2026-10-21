import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../public/to-dienstbord.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/to-dienstbord.css',import.meta.url),'utf8');

test('Four status buttons directly select any phase without an intermediate reset',()=>{
  for(const marker of [
    "statusButton('↗ Onderweg','team-response-underway'",
    "statusButton('● Ter plaatse','team-response-on-scene'",
    "statusButton('Ⅱ Pauze / NB','team-pause'",
    "statusButton('✓ Beschikbaar','team-available'",
    "case 'team-response-underway':case 'team-response-on-scene':",
    "case 'team-pause':case 'team-available':",
    "command('set-team-status',{id,status})",
    "const currentStatus=phase||",
    "const phaseControls=editable?",
    'role="group"',
    "aria-pressed="
  ])assert.ok(js.includes(marker),marker);
  assert.ok(!js.includes("statusButton('↺ Status wissen'"),'No manual reset button');
  assert.ok(!js.includes("case 'team-response-clear':"),'No intermediate status reset action');
  assert.ok(!js.includes('data-action="team-response-next"'),'Whole crew card is not clickable');
  assert.ok(js.includes("team-assignment-warning"),'Active incident assignments are not silently removed');
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


test('Crew cards expose unlink only while on active calls, confirm and select a single incident',()=>{
  for(const marker of [
    "busy.length?`<button type=\"button\" class=\"text-button team-detach-button\"",
    'data-action="team-detach-dialog"',
    "function detachTeamDialog(teamId)",
    "case 'team-detach-dialog':",
    "form:'detach-team-from-card'",
    "if(type==='detach-team-from-card')",
    "name=\"incidentId\"",
    "linked.length===1",
    "linked.map(incident=>",
    "linked.some(incident=>incident.id===incidentId)",
    "command('detach-team',{id:incidentId,teamId:id},revision)",
    "Ontkoppelen bevestigen",
    "De melding blijft bestaan"
  ])assert.ok(js.includes(marker),marker);
  assert.ok(css.includes('.team-actions .team-detach-button'));
  assert.ok(css.includes('.detach-assignment'));
});


test('TO takeover requires confirmation by new operator, never current operator approval',()=>{
  for(const marker of [
    "button('Dienst overnemen','takeover'",
    "Ben je zeker dat je deze dienst wilt overnemen?",
    "Ja, dienst overnemen",
    "form:takeover?'takeover':'start'",
    "type==='takeover'?{confirmation:'JA_OVERNAME'}",
    "case 'takeover':if(canOperate())startDialog(true)",
  ])assert.ok(js.includes(marker),marker);
  for(const retired of [
    'request-takeover','approve-takeover-dialog',
    'promptIncomingTakeover','emergency-takeover-dialog'
  ])assert.equal(js.includes(retired),false,retired);
});
