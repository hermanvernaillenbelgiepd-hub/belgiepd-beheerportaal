import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const from=html.indexOf('const POLICE_ROSTER_IDENTITY_MIN=');
const to=html.indexOf('const ROSTER_COLUMN_WIDTH_DEFAULTS=',from);
assert.ok(from>=0&&to>from,'compact layout helpers must exist');
const helpers=runInNewContext(html.slice(from,to)+`
({policeRosterIdentityWidth,policeRosterSpecialtyWidth,
  compactSpecialtyHeaderLabel,compactSpecialtyStatusLabel})`);

test('politie-kolommen behouden leesbare labels en statussen zonder uitloop',()=>{
 assert.equal(helpers.compactSpecialtyHeaderLabel('Signalisatie'),'SIGNA');
 assert.equal(helpers.compactSpecialtyHeaderLabel('INTERVENTIEDIENST'),'INTERVENTIE');
 assert.equal(helpers.compactSpecialtyStatusLabel('INSTRUCTEUR'),'INSTR.');
 assert.equal(helpers.compactSpecialtyStatusLabel('Specialisatie'),'SPEC.');
 assert.equal(helpers.compactSpecialtyStatusLabel('Stage'),'Stage');
 assert.match(html,/chip\.setAttribute\('aria-label',specialty\+' · '\+shown\.status\)/);
 assert.match(html,/restricted\.textContent=policeCompact\?'🔒'/);
 assert.match(html,/roster-police-compact \.specialty-status-col \.specialty-state\{/);
 assert.match(html,/overflow:hidden;text-overflow:ellipsis/);
});
test('compacte verhouding behoudt ruimte voor rang, naam en statussen',()=>{
 assert.equal(helpers.policeRosterIdentityWidth({call:42},'call'),48);
 assert.equal(helpers.policeRosterIdentityWidth({grade:68},'grade'),84);
 assert.equal(helpers.policeRosterIdentityWidth({status:58},'status'),85);
 const cfg={widths:{specialty:82}};
 assert.equal(helpers.policeRosterSpecialtyWidth(cfg,'RAGO'),72);
 cfg.specialtyWidths={RAGO:94};
 assert.equal(helpers.policeRosterSpecialtyWidth(cfg,'RAGO'),94);
 assert.match(html,/const weights=descriptors\.map\(descriptor=>descriptor\.specialty\?/);
 assert.match(html,/item\.style\.width=\(100\*weights\[i\]\/total\)/);
});
