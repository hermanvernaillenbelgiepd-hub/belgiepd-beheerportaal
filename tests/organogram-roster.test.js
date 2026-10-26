import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {publicOrganogramRoster} from '../src/member-dashboard-routes.js';
const id='111111111111111111';
const sample=['politie','brandweer','ambulance','depannage'].map(dept=>({
  personId:id,dept,name:dept+' lid',call:dept+'-101',rank:'Lid',status:'Verlof',
  secret:'VERTROUWELIJK',roleIds:['private'],notes:['privé'],
  specialties:[{label:dept==='ambulance'?'HELI':dept==='brandweer'?'Duiker':dept==='depannage'?'Opleiding FAST':'K9',value:'Ja'},
    {label:'Dossiernotitie',value:'Ja'},{label:'HELI',value:'Nee'}]
}));
test('Organogram geeft vier dienstregistraties weer zonder IDs of dossierinhoud',()=>{
  const rows=publicOrganogramRoster([...sample,sample[0],{...sample[0],dept:'burger'},
    {...sample[0],personId:'ongeldig',dept:'brandweer'}]);
  assert.deepEqual(new Set(rows.map(p=>p.dept)),new Set(['politie','brandweer','ambulance','depannage']));
  assert.equal(rows.length,4);
  for(const row of rows){
    assert.deepEqual(Object.keys(row).sort(),['dept','name','call','rank','specialties'].sort());
    assert.equal(row.specialties.length,1);
    assert.equal(row.specialties[0].value,'Ja');
    assert.ok(!JSON.stringify(row).includes(id));
    assert.ok(!JSON.stringify(row).includes('VERTROUWELIJK'));
  }
});
test('Organogramroute vereist Discord-verificatie en bevat geen schrijfacties',()=>{
  const source=readFileSync(new URL('../src/member-dashboard-routes.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
  assert.match(source,/app\.get\('\/api\/member\/organogram-roster',memberIdentity/);
  assert.match(source,/verifiedDiscordIdentity\(decoded,identity\.data\(\)/);
  assert.match(html,/\/api\/member\/organogram-roster/);
  assert.match(html,/\/api\/dossiercentrum\/overview/);
  assert.doesNotMatch(html,/\/api\/dossiercentrum\/public-roster/);
  assert.doesNotMatch(html,/method\s*:\s*['"](?:POST|DELETE|PATCH|PUT)['"]/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new Script(script));
});
