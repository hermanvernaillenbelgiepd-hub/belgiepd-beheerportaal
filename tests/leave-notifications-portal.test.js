import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leaveGrantDepartments,mayReviewLeaveNotifications,mayManageGrants,
  mayApproveLeave} from '../src/leave-policy.js';

const id='111111111111111111',other='222222222222222222';
const member=(role='basiskader',dept='politie')=>({
  uid:'discord:'+id,discordId:id,role,departments:[dept],
  departmentRoles:{[dept]:role}
});
test('Meldingen is restricted to authorised cadre and delegated leave reviewers',()=>{
 assert.equal(mayReviewLeaveNotifications(member()),false);
 assert.equal(mayReviewLeaveNotifications(member('middenkader')),true);
 assert.equal(mayReviewLeaveNotifications(member('officierenkader')),true);
 assert.equal(mayReviewLeaveNotifications(member('korpsleiding')),true);
 assert.equal(mayReviewLeaveNotifications(member(),true),true);
 assert.equal(mayReviewLeaveNotifications({...member(),role:'beheerder'}),true);
 assert.equal(mayReviewLeaveNotifications({...member(),departments:[],role:'middenkader'}),false);
 const req={personDiscordId:other,subjectDepartments:['politie'],status:'pending',
    startDate:'2026-10-22',endDate:'2026-11-21'};
 assert.equal(mayApproveLeave(member('middenkader'),req,null,'2026-10-22'),false);
 assert.equal(mayApproveLeave(member('officierenkader'),req,null,'2026-10-22'),true);
 assert.equal(mayApproveLeave(member('officierenkader'),{...req,personDiscordId:id},null,'2026-10-22'),false);
});
test('Temporary leave management belongs only to officers, chiefs, verified Board or technical admin',()=>{
 const all=['politie','brandweer','ambulance','depannage'];
 assert.deepEqual(leaveGrantDepartments(member('basiskader')),[]);
 assert.deepEqual(leaveGrantDepartments(member('middenkader')),[]);
 assert.deepEqual(leaveGrantDepartments(member('officierenkader')),['politie']);
 assert.deepEqual(leaveGrantDepartments(member('korpsleiding','brandweer')),['brandweer']);
 assert.deepEqual(leaveGrantDepartments(member('basiskader'),true),all);
 assert.deepEqual(leaveGrantDepartments({...member(),role:'beheerder'}),all);
 assert.equal(mayManageGrants(member('middenkader')),false);
 assert.equal(mayManageGrants(member('korpsleiding')),true);
 assert.deepEqual(leaveGrantDepartments({...member('korpsleiding'),departments:['politie','brandweer'],
   departmentRoles:{politie:'korpsleiding',brandweer:'basiskader'}}),['politie']);
});
test('Personal leave page is reduced to requests; review queues live under protected Meldingen',()=>{
 const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const leave=file('public/verlofbeheer.html'),notifications=file('public/meldingen.html');
 const admin=file('public/gebruikersbeheer.html'),home=file('public/index.html'),
   routes=file('src/leave-routes.js');
 assert.ok(leave.includes('id="myRequests"'));
 assert.equal(leave.includes('id="lookupForm"'),false);
 assert.equal(leave.includes('id="delegationPanel"'),false);
 assert.equal(leave.includes('id="reviewList"'),false);
 assert.ok(notifications.includes("api('/api/leave/notifications/context')"));
 assert.ok(notifications.includes('if(!access.canReview)'));
 assert.ok(notifications.includes("result.toReview||[]"));
 assert.ok(notifications.includes("api('/api/leave/requests/'+encodeURIComponent(x.id)+'/decision'"));
 assert.ok(home.includes('href="/meldingen.html"'));
 assert.ok(routes.includes("app.get('/api/leave/notifications/context',requireUser"));
 assert.ok(routes.includes("return res.json({canReview:mayReviewLeaveNotifications"));
 assert.ok(admin.includes('data-tab="leave"'));
 assert.ok(admin.includes('id="leaveGrantSection"'));
 assert.ok(admin.includes("api('/api/leave/grants/context')"));
 assert.ok(routes.includes("app.get('/api/leave/grants/context',requireUser"));
 assert.ok(routes.includes('verifyBoardDiscordRole(member.data(),process.env.DISCORD_GUILD_ID)'));
 assert.ok(routes.includes('activeBoardAppointment(board.data())'));
 assert.ok(routes.includes("!previous.get('grantDepartments').every(dept=>allowed.includes(dept))"));
 assert.ok(routes.includes('!previous.grantDepartments.every(d=>allowed.includes(d))'));
});
