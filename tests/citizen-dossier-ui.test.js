import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/burger-personeelsdossiers.html',import.meta.url),'utf8');
const legacyCss=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');

test('Burgerdossier uses its own visible submit button, not the hidden police #save control',()=>{
  // The shared onepage CSS intentionally hides #save for the Police personnel form.
  assert.match(legacyCss,/body\.dossier-onepage #save,/);
  assert.match(html,/<form id="entryForm">[\s\S]*?<button type="submit" id="citizenEntrySave">Registratie definitief opslaan<\/button>/);
  assert.doesNotMatch(html,/\bid="save"/);
  assert.match(html,/button=\$\('citizenEntrySave'\)/);
  assert.match(html,/#citizenEntrySave\{display:inline-flex/);
});

test('Burgerdossier shows one cohesive sheet with integrated record sections',()=>{
  assert.match(html,/<article class="citizen-sheet"/);
  assert.match(html,/class="citizen-section-list"/);
  assert.doesNotMatch(html,/class="tiles"/);
  for(const id of ['citizenLeave','citizenNotes','citizenObservations',
    'citizenSanctions','citizenPromotions','citizenReport','citizenDeletionLog'])
    assert.match(html,new RegExp('id="'+id+'"'));
  for(const id of ['leave','notes','observations','sanctions','promotions',
    'deletionLog','formCard','saveStatus','entryForm','deleteDialog'])
    assert.match(html,new RegExp('id="'+id+'"'));
});

test('Burgerdossier preserves write confirmation and audited deletion',()=>{
  assert.match(html,/fresh\.entries\?\.some\(entry=>entry\.id===savedId\)/);
  assert.match(html,/fresh\.deletionLog\?\.some\(e=>e\.entryId===target\.entryId\)/);
  assert.match(html,/\bid="deleteReason"/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
});

test('Browser-side script remains syntactically valid',()=>{
  const script=/<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new Function(script));
});
