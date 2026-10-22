import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {policeKader,displaySeries,normalizePersonnel} from '../src/normalize.js';
import {recognizeRoles,roleSummary} from '../src/role-catalog.js';

const visualsSource=readFileSync(new URL('../public/personnel-list-visuals.js',import.meta.url),'utf8');
const context={window:{}};
runInNewContext(visualsSource,context);
const visual=context.window.BPDPersonnelVisuals;

test('Tijdelijke en vaste 100-299 vallen onder Agentenkader',()=>{
  for(const call of ['100','199','200','299','S250','S-299']){
    assert.equal(policeKader('Agent van Politie (AP)',call),'Agentenkader',call);
    assert.equal(visual.policeCadre({dept:'politie',rank:'AP',call}),'Agentenkader',call);
  }
});
test('Roepnummer 300 is Basiskader en kaderleden met hogere graad blijven hoger kader',()=>{
  assert.equal(policeKader('Agent van politie','300'),'Basiskader');
  assert.equal(policeKader('Inspecteur van politie','S302'),'Basiskader');
  assert.equal(policeKader('Hoofdinspecteur','485'),'Middenkader');
  assert.equal(visual.policeCadre({dept:'politie',rank:'INP',call:'300'}),'Basiskader');
  assert.equal(visual.policeCadre({dept:'politie',rank:'HINP',call:'485'}),'Middenkader');
  assert.equal(visual.policeCadre({dept:'ambulance',rank:'INP',call:'250'}),null);
  assert.equal(visual.policeCadre({dept:'politie',rank:'Onbekend',call:'008'}),null);
});
test('Reeks wordt behouden naast de informatieve kaderbenaming',()=>{
  assert.equal(displaySeries('KADER','Agent van Politie','politie','250'),'Agentenkader');
  assert.equal(displaySeries('KADER','Inspecteur','politie','300'),'Basiskader');
  assert.equal(displaySeries('03','Agent van Politie','politie','250'),'Reeks 03');
  assert.equal(visual.seriesWithCadre({dept:'politie',rank:'AP',call:'250'},'Reeks 03'),'Reeks 03 · Agentenkader');
  assert.equal(visual.seriesWithCadre({dept:'politie',rank:'AP',call:'250'},'Agentenkader'),'Agentenkader');
});
test('Personeelsnormalisatie wijzigt geen rang of roepnummer, maar levert kader apart',()=>{
  const row=Array(18).fill('');
  row[0]='250';row[2]='Agent van Politie (AP)';row[3]='Voorbeeld Medewerker';
  row[4]='KADER';row[17]='111111111111111111';
  const p=normalizePersonnel('politie',[[],row])[0];
  assert.equal(p.call,'250');
  assert.equal(p.rank,'Agent van Politie (AP)');
  assert.equal(p.series,'Agentenkader');
  assert.equal(p.kader,'Agentenkader');
});
test('Bestuur is een aparte geverifieerde Discord-rol, nooit politiemachtiging',()=>{
  const id='1309532438082355251';
  const recognized=recognizeRoles([id]);
  assert.equal(recognized.length,1);
  assert.equal(recognized[0].name,'Bestuur');
  assert.equal(recognized[0].kind,'bestuursfunctie');
  const summary=roleSummary([id]);
  assert.equal(summary.policeRank,null);
  assert.equal(summary.departments.length,0);
});
