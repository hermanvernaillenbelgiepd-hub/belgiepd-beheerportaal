import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DECORATION_CATALOG,validateDecoration,isDecorationActive,publicDecorations,
  expirationDate,manageDecorations,canManagePoliceDecoration}
 from '../src/personnel-decoration-policy.js';
const now='2026-10-27';
const active={
 id:'award-123',catalogId:'kroon_blauw',public:true,reason:'Bijzondere inzet voor de organisatie',
 startDate:'2026-10-27',endDate:'2026-10-29',grantedByUid:'secret',
 grantedByDiscordId:'111111111111111111'
};
test('onderscheidingen hebben uniek benoemde catalogusitems',()=>{
 assert.equal(DECORATION_CATALOG.length,13);
 assert.equal(new Set(DECORATION_CATALOG.map(x=>x.id)).size,13);
});
test('looptijd is inclusief einddatum en verdwijnt erna zonder verwijdering',()=>{
 assert.equal(isDecorationActive(active,'2026-10-27'),true);
 assert.equal(isDecorationActive(active,'2026-10-29'),true);
 assert.equal(isDecorationActive(active,'2026-10-30'),false);
 assert.equal(publicDecorations([active],'2026-10-29').length,1);
 assert.equal(publicDecorations([active],'2026-10-30').length,0);
 assert.equal(manageDecorations([active],'2026-10-30')[0].state,'verlopen');
 assert.equal(expirationDate('2026-10-29'),'2026-10-30');
});
test('geplande en ingetrokken onderscheidingen blijven onzichtbaar',()=>{
 assert.equal(isDecorationActive({...active,startDate:'2026-11-01'},now),false);
 assert.equal(isDecorationActive({...active,revokedAt:'2026-10-27T15:00:00Z'},now),false);
 assert.equal(publicDecorations([{...active,public:false}],now).length,0);
 const publicItem=publicDecorations([active],now)[0];
 assert.deepEqual(Object.keys(publicItem).sort(),['id','label','kind','color','priority'].sort());
 assert.equal(JSON.stringify(publicItem).includes('secret'),false);
});
test('valideer tijdelijkheid en motivering',()=>{
 assert.deepEqual(validateDecoration({catalogId:'kroon_blauw',
  startDate:'2026-10-27',endDate:'2026-10-28',public:true,
  reason:'Bijzondere inzet binnen BelgiumPD'},now).endDate,'2026-10-28');
 assert.throws(()=>validateDecoration({catalogId:'kroon_blauw',
  startDate:'2026-10-27',endDate:'2026-10-26',public:true,
  reason:'Bijzondere inzet binnen BelgiumPD'},now));
 assert.throws(()=>validateDecoration({catalogId:'onbekend',public:true,
  reason:'Bijzondere inzet binnen BelgiumPD'},now));
});
test('geen schrijfrechten zonder geverifieerd officierenkader',()=>{
 const target={dept:'politie',personId:'111111111111111111',call:'438',rank:'Inspecteur'};
 assert.equal(canManagePoliceDecoration({role:'beheerder',boardPersonnelAdmin:true},target),false);
 assert.equal(canManagePoliceDecoration({uid:'discord:222222222222222222',
  discordId:'222222222222222222',role:'middenkader',departments:['politie'],
  departmentRoles:{politie:'middenkader'},dossierNativeDepartments:['politie'],
  dossierAllowedDepartments:['politie']},target),false);
 assert.equal(canManagePoliceDecoration({uid:'discord:222222222222222222',
  discordId:'222222222222222222',role:'officierenkader',departments:['brandweer'],
  departmentRoles:{brandweer:'officierenkader'},dossierNativeDepartments:['brandweer'],
  dossierAllowedDepartments:['brandweer']},target),false);
});
test('beveiligde acties en log van toekenning/intrekking blijven gescheiden',()=>{
 const source=readFileSync(new URL('../src/personnel-decoration-routes.js',import.meta.url),'utf8');
 const member=readFileSync(new URL('../src/member-dashboard-routes.js',import.meta.url),'utf8');
 const report=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(source,/app\.post\('\/api\/personnel-awards\/grant',requireUser,secureSubject/);
 assert.match(source,/app\.post\('\/api\/personnel-awards\/revoke',requireUser,secureSubject/);
 assert.match(source,/canManagePoliceDecoration\(req\.bpd,subject\)/);
 assert.match(source,/award_granted/);
 assert.match(source,/award_revoked/);
 assert.match(member,/publicDecorations/);
 assert.match(report,/decoration-expired:/);
 assert.match(page,/organogram-decorations\.js/);
 assert.match(page,/awards:\(Array\.isArray\(r\.awards\)/);
 const js=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js));
});

test('korpspluim toont aantal afzonderlijk goedgekeurde vermeldingen met een symbool',()=>{
 const oldAwards=[...Array(3)].map((_,i)=>({
  ...active,id:'award-'+i,catalogId:'korpspluim',endDate:null,startDate:now
 }));
 const display=publicDecorations(oldAwards,now);
 assert.equal(display.length,1);
 assert.equal(display[0].id,'korpspluim');
 assert.equal(display[0].count,3);
 assert.equal(publicDecorations([{...oldAwards[0],revokedAt:now}],now).length,0);
 assert.equal(publicDecorations([{...oldAwards[0],public:false}],now).length,0);
});
test('eretekentoekenning aan zichzelf is verboden; 900 en 910 blijven toekenbaar',()=>{
 const giver={uid:'discord:222222222222222222',discordId:'222222222222222222',
 role:'officierenkader',departments:['politie'],departmentRoles:{politie:'officierenkader'},
 dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie']};
 assert.equal(canManagePoliceDecoration(giver,{dept:'politie',personId:giver.discordId,call:'930'}),false);
 assert.equal(canManagePoliceDecoration(giver,{dept:'politie',personId:'333333333333333333',call:'900'}),true);
 const route=readFileSync(new URL('../src/personnel-decoration-routes.js',import.meta.url),'utf8');
 assert.match(route,/input.catalogId!=='korpspluim'/);
});
