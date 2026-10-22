import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {
  BOARD_COLLECTION,BOARD_PERMISSIONS,boardEnabled,boardWritesEnabled,
  isTechnicalBoardApprover,hasBoardPermission,activeBoardAppointment,
  mayNominateForBoard,mayDecideBoard,validateBoardNomination,
  validateBoardDecision,validateBoardRevocation,serializeBoardAppointment
} from '../src/board-appointment-policy.js';
import {approvedManagedEntry,validUserGrant} from '../src/user-access.js';

const target='169464525505036288';
const other='222222222222222222';
const admin={uid:'admin-firebase-uid',discordId:other,role:'beheerder',
  departments:['politie'],departmentRoles:{politie:'korpsleiding'}};
const officer={uid:'discord:'+other,discordId:other,role:'officierenkader',
  departments:['politie'],departmentRoles:{politie:'officierenkader'}};
const leader={...officer,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'}};
const pending={status:'pending',requestedByUid:leader.uid,requestedPermissions:['board_registry_read']};

test('Board title remains outside operational user and cadre rank lists',()=>{
  assert.equal(BOARD_COLLECTION,'bpd_board_appointments');
  assert.deepEqual(BOARD_PERMISSIONS,['board_registry_read','board_nomination_propose']);
  assert.equal(approvedManagedEntry({
    status:'approved',discordId:target,role:'officierenkader',
    departments:['politie'],departmentRoles:{politie:'officierenkader'}
  },target).role,'officierenkader');
  assert.throws(()=>validUserGrant({role:'bestuur',departments:['politie'],
    reason:'Bestuur aanstellen'}));
});
test('Board reads and writes are independent and default off',()=>{
  assert.equal(boardEnabled({}),false);
  assert.equal(boardWritesEnabled({BPD_ENABLE_BOARD_APPOINTMENT_WRITES:'true'}),false);
  assert.equal(boardWritesEnabled({BPD_ENABLE_BOARD_APPOINTMENTS:'true'}),false);
  assert.equal(boardWritesEnabled({BPD_ENABLE_BOARD_APPOINTMENTS:'true',
    BPD_ENABLE_BOARD_APPOINTMENT_WRITES:'true'}),true);
});
test('Separate capabilities do not follow an operational role or title',()=>{
  assert.equal(hasBoardPermission({status:'approved',permissions:[]},'board_registry_read'),false);
  assert.equal(hasBoardPermission({status:'pending',permissions:['board_registry_read']},'board_registry_read'),false);
  assert.equal(hasBoardPermission({status:'approved',permissions:['board_registry_read']},'board_registry_read'),true);
  assert.equal(hasBoardPermission({status:'revoked',permissions:['board_registry_read']},'board_registry_read'),false);
  assert.equal(activeBoardAppointment({status:'approved',permissions:['board_registry_read','board_registry_read']}),false);
  assert.equal(hasBoardPermission({status:'approved',permissions:['admin']},'admin'),false);
});
test('Only corps leadership, technical manager or specifically delegated board member may nominate',()=>{
  assert.equal(mayNominateForBoard(officer,null),false);
  assert.equal(mayNominateForBoard(leader,null),true);
  assert.equal(mayNominateForBoard(admin,null),true);
  assert.equal(mayNominateForBoard(officer,{status:'approved',permissions:['board_nomination_propose']}),true);
  assert.equal(mayNominateForBoard(officer,{status:'pending',permissions:['board_nomination_propose']}),false);
  assert.equal(mayNominateForBoard({...leader,departmentRoles:{politie:'basiskader'}},null),false);
});
test('Independent technical approval forbids self and same requester',()=>{
  assert.equal(isTechnicalBoardApprover(leader),false);
  assert.equal(isTechnicalBoardApprover(admin),true);
  assert.equal(mayDecideBoard(admin,target,pending),true);
  assert.equal(mayDecideBoard(leader,target,pending),false);
  assert.equal(mayDecideBoard({...admin,uid:leader.uid},target,pending),false);
  assert.equal(mayDecideBoard({...admin,discordId:target},target,pending),false);
  assert.equal(mayDecideBoard(admin,target,{...pending,status:'approved'}),false);
  assert.equal(mayDecideBoard(admin,'not-a-discord-id',pending),false);
});
test('Board nomination payload accepts only explicit bounded capabilities and motivation',()=>{
  const payload={discordId:target,permissions:['board_registry_read'],
    reason:'Voorgedragen na bespreking binnen de korpsleiding'};
  assert.deepEqual(validateBoardNomination(payload),payload);
  assert.deepEqual(validateBoardNomination({...payload,permissions:[]}).permissions,[]);
  assert.throws(()=>validateBoardNomination({...payload,permissions:['beheerder']}));
  assert.throws(()=>validateBoardNomination({...payload,permissions:['board_registry_read','board_registry_read']}));
  assert.throws(()=>validateBoardNomination({...payload,role:'beheerder'}));
  assert.throws(()=>validateBoardNomination({...payload,reason:'kort'}));
  assert.throws(()=>validateBoardNomination({...payload,discordId:'invalid'}));
  assert.deepEqual(validateBoardDecision({decision:'approved',reason:payload.reason}),
    {decision:'approved',reason:payload.reason});
  assert.throws(()=>validateBoardDecision({decision:'revoked',reason:payload.reason}));
  assert.deepEqual(validateBoardRevocation({reason:payload.reason}),{reason:payload.reason});
});
test('Public board DTO provides only appointment fields, never operational grants or audit secrets',()=>{
  const dto=serializeBoardAppointment(target,{status:'approved',username:'BelgaMods',
    permissions:['board_registry_read'],requestedPermissions:['board_registry_read'],
    originalRole:'officierenkader',token:'do-not-emit'});
  assert.deepEqual(dto,{discordId:target,name:'BelgaMods',title:'Bestuur',
    status:'approved',permissions:['board_registry_read'],
    requestedPermissions:['board_registry_read'],
    proposedAt:null,decidedAt:null,revokedAt:null});
  assert.equal(serializeBoardAppointment('invalid',{}),null);
  assert.deepEqual(serializeBoardAppointment(target,{status:'pending',
    requestedPermissions:['board_registry_read']}).permissions,[]);
});
test('Endpoints preserve user role store and use separate immutable audit',()=>{
  const routes=readFileSync(new URL('../src/board-appointment-routes.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.ok(server.includes('installBoardAppointmentRoutes(app,{requireUser});'));
  assert.ok(routes.includes("app.post('/api/board/nominations',requireUser,guard,requireBoardWrites"));
  assert.ok(routes.includes("app.post('/api/board/:discordId/decision',requireUser,guard,requireBoardWrites"));
  assert.ok(routes.includes("app.post('/api/board/:discordId/revoke',requireUser,guard,requireBoardWrites"));
  assert.ok(routes.includes("candidate.get('status')!=='approved'"));
  assert.ok(routes.includes('mayDecideBoard(req.bpd,req.params.discordId,data)'));
  assert.ok(routes.includes("ref.collection('audit').doc()"));
  assert.equal(routes.includes("db.collection(USER_COLLECTION).doc(payload.discordId)).set("),false);
  assert.equal(routes.includes('tx.update(db.collection(USER_COLLECTION)'),false);
  assert.equal(routes.includes('departmentRoles:'),false);
});
test('Board status distinguishes a verified Discord Bestuur role from the appointment register',()=>{
  const routes=readFileSync(new URL('../src/board-appointment-routes.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
  assert.ok(routes.includes("app.get('/api/board/me',requireUser,guard"));
  assert.ok(routes.includes('verifyBoardDiscordRole('));
  assert.ok(routes.includes('getFirestore().collection(\'bpd_discord_auth\')'));
  assert.ok(routes.includes('discordBoardVerified'));
  assert.ok(routes.includes('appointment:entry?.status===\'approved\'?entry:null'));
  assert.ok(html.includes('own.discordBoardVerified===true'));
  assert.ok(html.includes('id="boardDiscordStatus"'));
  assert.ok(html.includes('id="boardHelp"'));
  assert.ok(html.includes('/discord-status.html'));
  assert.ok(html.includes('/gebruikersbeheer.html#dienstbeheer'));
  assert.ok(!routes.includes('req.bpd.role=\'bestuur\''));
});
test('Registration back link and limited portal return to dashboard instead of observation loop',()=>{
  const registrations=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
  const dashboard=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.ok(registrations.includes('id="backToDashboard"'));
  assert.ok(registrations.includes('href="/" id="backToDashboard"'));
  assert.equal(dashboard.includes("window.location.assign('/registraties.html');return;"),false);
  assert.ok(dashboard.includes("restrictedPortal=true"));
  assert.ok(dashboard.includes("page='dashboard'"));
  assert.ok(dashboard.includes("employees=[]"));
  assert.doesNotThrow(()=>new Script(dashboard.match(/<script>([\s\S]*?)<\/script>/)[1]));
});
test('User management Board UI has separate nomination and decision controls',()=>{
  const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
  assert.ok(html.includes('id="boardSection"'));
  assert.ok(html.includes('id="boardNominationForm"'));
  assert.ok(html.includes('Bestuur · afzonderlijke bestuursfunctie'));
  assert.ok(html.includes("'/api/board/overview'"));
  assert.ok(html.includes('await boardRefresh()'));
  assert.equal(/roles=\[[^\]]*['"]bestuur['"]/.test(html),false);
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match);assert.doesNotThrow(()=>new Script(match[1]));
});
