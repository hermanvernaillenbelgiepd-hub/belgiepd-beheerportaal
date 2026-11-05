import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayReviewLeaveNotifications} from '../src/leave-policy.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Officierenkader 930 heeft kaderbevoegdheid voor meldingen ongeacht andere dienstrollen',()=>{
 const officer={
   discordId:'930930930930930930',role:'officierenkader',
   departments:['politie','brandweer'],
   departmentRoles:{politie:'officierenkader',brandweer:'middenkader'}
 };
 assert.equal(mayReviewLeaveNotifications(officer),true);
 assert.equal(mayReviewLeaveNotifications({...officer,role:'korpsleiding',
   departmentRoles:{politie:'korpsleiding',brandweer:'korpsleiding'}}),true);
});

test('Meldingen staat bij geverifieerd kader zowel in het algemene menu als de startpagina',()=>{
 const nav=source('public/bpd-navigation.js');
 const home=source('public/index.html');
 const staff=nav.match(/const STAFF=\[([\s\S]*?)\];/)?.[1]||'';
 assert.match(staff,/'notifications'/,
   'Staff sidebar must contain Meldingen for officers such as 930');
 const homeMenu=home.slice(home.indexOf('<nav id="staffNav"'),home.indexOf('</nav>',home.indexOf('<nav id="staffNav"')));
 assert.match(homeMenu,/href="\/meldingen\.html"/,
   'Officer homepage menu must contain Meldingen');
 assert.match(home,/href="\/meldingen\.html"/);
});

test('Eigen meldingen blijven zichtbaar naast te behandelen verlofaanvragen voor leiding',()=>{
 const page=source('public/meldingen.html');
 const start=page.indexOf("const access=await api('/api/leave/notifications/context');");
 const personal=page.indexOf("const root=$('personalList');root.replaceChildren();",start);
 const visible=page.indexOf("$('personalPanel').hidden=false;",personal);
 const reviewCondition=page.indexOf('if(!access.canReview){',start);
 const reviewPane=page.indexOf("$('reviewPanel').hidden=false;",start);
 assert.ok(start>0&&start<personal&&personal<visible&&visible<reviewCondition&&reviewCondition<reviewPane,
   'Show own notifications before conditioning review inbox on cadre rights');
 assert.match(page,/result\.mine\|\|\[\]/,
   'Personal leave entries must be sourced only from the authenticated user');
 assert.match(page,/result\.toReview\|\|\[\]/,
   'Team notification inbox must remain separately scoped');
 assert.match(page,/loadActivityPings\(\)/);
 assert.match(page,/loadTraining\(\)/);
});
