import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SERVICES,getTier,depannageOrganogramGroups,serviceHierarchy}
 from '../public/assets/organogram-hierarchie-model.js';
import {verifiedDepannageOrganogramGroups,LEADERSHIP_LEVELS}
 from '../src/organogram-placement-policy.js';
const p=(name,call,fields={})=>({dept:'depannage',name,call,rank:'Technicus',
 specialties:[],...fields});
test('AWV, LSRA and FAST are always present in the fixed order',()=>{
 const labels=['Leiding / AWV','LSRA','FAST'];
 assert.deepEqual(SERVICES.find(s=>s.id==='depannage').levels,labels);
 assert.deepEqual(LEADERSHIP_LEVELS.depannage,labels);
 assert.deepEqual(serviceHierarchy([],'depannage').leadership.map(x=>x.label),labels);
});
test('Overlapping members are shown in both appropriate functions, never twice in the same one',()=>{
 const both=p('Dubbel','LSRA-20',{depannageGroups:['lsra','fast'],
  specialties:['F.A.S.T','FAST','CRANE']});
 const rows=[p('AWV','LSRA-01',{depannageGroups:['awv']}),both,
  p('FAST alleen','FAST-03',{depannageGroups:['fast']}),
  p('Onbekend','DEPK-04'),p('LRSA-alias','LRSA-05')];
 const chart=serviceHierarchy(rows,'depannage');
 assert.equal(chart.count,5);
 const [awv,lsra,fast]=chart.leadership.map(x=>x.members.map(p=>p.name));
 assert.deepEqual(awv,['AWV']);
 assert.deepEqual(new Set(lsra),new Set(['Dubbel','Onbekend','LRSA-alias']));
 assert.deepEqual(new Set(fast),new Set(['Dubbel','FAST alleen']));
 assert.equal(lsra.filter(n=>n==='Dubbel').length,1);
 assert.equal(fast.filter(n=>n==='Dubbel').length,1);
 assert.ok(chart.branches.some(x=>x.label==='CRANE'));
 assert.ok(!chart.branches.some(x=>['LSRA','F.A.S.T','FAST'].includes(x.label)));
});
test('Historic calls, CRANE and manual placements behave independently',()=>{
 assert.deepEqual(depannageOrganogramGroups(p('AWV','AWV-01')),['Leiding / AWV']);
 assert.deepEqual(depannageOrganogramGroups(p('LSRA','LRSA-02')),['LSRA']);
 assert.deepEqual(depannageOrganogramGroups(p('FAST','F.A.S.T.-02')),['FAST']);
 assert.deepEqual(depannageOrganogramGroups(p('Dubbel','LSRA-02',{specialties:['F.A.S.T']})),['LSRA','FAST']);
 assert.deepEqual(depannageOrganogramGroups(p('Kraan','LSRA-10',{specialties:['CRANE']})),['LSRA']);
 assert.deepEqual(depannageOrganogramGroups(p('Extra','DEPK-12',{leadershipTier:'FAST'})),['LSRA','FAST']);
 assert.equal(getTier(p('Geen','DEPK-01')),'LSRA');
});
test('Only guild-verified known service roles create confirmed function codes',()=>{
 const guild='1309532438053130326',now=Date.UTC(2026,10,3,7);
 const member=roleIds=>({guildId:guild,verifiedAt:now-500,roleIds});
 const ids=['1309532438019706969','1309532438019706971',
  '1309532438019706970','1562090158667333692'];
 assert.deepEqual(verifiedDepannageOrganogramGroups(member(ids),guild,now),['awv','lsra','fast']);
 assert.deepEqual(verifiedDepannageOrganogramGroups(member([ids[3]]),guild,now),[]);
 assert.deepEqual(verifiedDepannageOrganogramGroups(member(ids),'123456789012345678',now),[]);
 assert.deepEqual(verifiedDepannageOrganogramGroups({...member(ids),verifiedAt:now-8*86400000},guild,now),[]);
 assert.deepEqual(verifiedDepannageOrganogramGroups({...member(ids),roleIds:['garbage']},guild,now),[]);
});
test('Public client receives safe group codes rather than raw role IDs',()=>{
 const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(route,/depannageGroups:verifiedDepannageOrganogramGroups/);
 assert.match(page,/depannageGroups:p\.dept==='depannage'/);
 assert.doesNotMatch(page,/roleIds:p\.roleIds/);
});

test('registered Depannage director is visibly AWV without privileged Discord grant',()=>{
 const director=p('Royke','—',{rank:'Directeur'});
 assert.deepEqual(depannageOrganogramGroups(director),['Leiding / AWV']);
 assert.deepEqual(depannageOrganogramGroups({...director,depannageGroups:['lsra']}),['Leiding / AWV','LSRA']);
 assert.deepEqual(serviceHierarchy([director],'depannage').leadership[0].members.map(x=>x.name),['Royke']);
 assert.deepEqual(depannageOrganogramGroups(p('Lid','—',{rank:'Technicus'})),['LSRA']);
});
