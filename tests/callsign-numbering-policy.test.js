import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkApplicant,orderedCallNumbers,preferredFreeCall,planPoliceSheetSync} from '../src/callsign-utils.js';

const discordId='123456789012345678';
test('CALL 101–199 geldt als tijdelijk nummer, zonder leidende nullen of 100/200',()=>{
  for(const value of ['101','105','110','150','195','199'])
    assert.equal(checkApplicant({name:'Voorbeeld',discordId,temporaryCall:value}).temporaryCall,value);
  for(const value of ['100','200','1100','0101','99','abc','']) 
    assert.throws(()=>checkApplicant({name:'Voorbeeld',discordId,temporaryCall:value}),/101 en 199/);
});
test('10-5-1 verdeelt tijdelijk en vast: tientallen, vijftallen, daarna de rest',()=>{
  const fixed=orderedCallNumbers(200,299);
  assert.deepEqual(fixed.slice(0,10),[200,210,220,230,240,250,260,270,280,290]);
  assert.deepEqual(fixed.slice(10,20),[205,215,225,235,245,255,265,275,285,295]);
  assert.deepEqual(fixed.slice(20,28),[201,202,203,204,206,207,208,209]);
  assert.equal(fixed.length,100);
  assert.equal(new Set(fixed).size,100);
  const temporary=orderedCallNumbers(101,199);
  assert.deepEqual(temporary.slice(0,9),[110,120,130,140,150,160,170,180,190]);
  assert.deepEqual(temporary.slice(9,19),[105,115,125,135,145,155,165,175,185,195]);
  assert.deepEqual(temporary.slice(19,24),[101,102,103,104,106]);
  assert.equal(temporary.length,99);
  assert.equal(new Set(temporary).size,99);
  assert.equal(preferredFreeCall(101,199,[110,120]),130);
  assert.equal(preferredFreeCall(200,299,orderedCallNumbers(200,299).slice(0,10)),205);
  assert.equal(preferredFreeCall(200,201,[200,201]),null);
  assert.throws(()=>orderedCallNumbers(999,100),/Ongeldige/);
});
test('Vaste 200-reeks volgt 10-5-1, maar behoudt expliciet goedgekeurde voorkeur',()=>{
  const rows=Array.from({length:100},(_,i)=>[String(200+i),'','Agent van Politie (AP)','']);
  const info=[['Naam','Rang'],['Eerder lid','','']];
  const basic={policeRows:rows,infoRows:info,name:'Voorbeeld Nieuw',discordId};
  assert.equal(planPoliceSheetSync(basic).call,200);
  rows[0][3]='Reeds bezet';
  assert.equal(planPoliceSheetSync(basic).call,210);
  for(const n of [210,220,230,240,250,260,270,280,290])
    rows[n-200][3]='Bezet '+n;
  assert.equal(planPoliceSheetSync(basic).call,205);
  assert.equal(planPoliceSheetSync({...basic,preferredCall:201}).call,201);
  // If the same CALL appears twice in source, skip it rather than making a duplicate.
  rows.push(['205','','Agent van Politie (AP)','']);
  assert.equal(planPoliceSheetSync(basic).call,215);
});
test('Voorbeeld vermeldt gedeelde 900-reeks en personeelscontinuïteit per Discord-ID',()=>{
  const js=readFileSync(new URL('../public/toegangsvoorbeeld.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/toegangsvoorbeeld.html',import.meta.url),'utf8');
  assert.match(js,/Middenkader · CALL 600–899/);
  assert.match(js,/Officierenkader · CALL 900–999; Discord-rol bepaalt rechten/);
  assert.match(js,/Korpsleiding · CALL 900–999; Discord-rol bepaalt rechten/);
  assert.match(html,/herindiensttreding/);
  assert.match(html,/geen tweede dossier/);
  assert.match(html,/eerst de tientallen/);
  assert.match(html,/101–199/);
});
