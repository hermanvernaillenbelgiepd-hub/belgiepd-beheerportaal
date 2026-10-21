import test from 'node:test';
import assert from 'node:assert/strict';
import {callsignForTO,isTemporaryTOUnit,temporaryTOCall,validTOCall} from '../src/to-operator-identity.js';
import {parseSonoranName} from '../src/to-radio.js';
import {emptyBoard,applyBoardCommand} from '../src/to-board-policy.js';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';

const actor={uid:'discord:111111111111111111',discordId:'111111111111111111',
  role:'middenkader',departments:['politie'],departmentRoles:{politie:'middenkader'}};
const staff=(id,call,dept='politie')=>({dept,personId:id,call,name:'Medewerker Test'});
const policeCall=(value)=>parseSonoranName('SANTO-'+value+' | Nieuw lid');

test('TO identity follows the authenticated Discord ID, never a matching name or role',()=>{
  assert.deepEqual(callsignForTO(actor,[
    staff('222222222222222222','945'),staff(actor.discordId,'930'),
    staff(actor.discordId,'560','brandweer')
  ]),{call:'930',source:'personeelslijst'});
  assert.equal(callsignForTO({...actor,discordId:'333333333333333333'},[staff(actor.discordId,'930')]),null);
  assert.equal(callsignForTO({...actor,discordId:''},[staff(actor.discordId,'930')]),null);
  assert.equal(callsignForTO(actor,[staff(actor.discordId,'930'),staff(actor.discordId,'931')]),null);
  assert.equal(callsignForTO(actor,[staff(actor.discordId,'neen')]),null);
});

test('Verified temporary police callsign can fill the TO label while submitted claims cannot',()=>{
  const request={discordId:actor.discordId,temporaryCall:'130',status:'verified'};
  assert.deepEqual(callsignForTO(actor,[],request),{call:'130',source:'geverifieerd_tijdelijk'});
  assert.equal(callsignForTO(actor,[],{...request,status:'submitted'}),null);
  assert.equal(callsignForTO(actor,[],{...request,discordId:'222222222222222222'}),null);
  assert.equal(callsignForTO(actor,[],{...request,temporaryCall:'930'}),null);
  assert.equal(callsignForTO(actor,[],{...request,temporaryCall:'008'}),null);
  assert.deepEqual(callsignForTO(actor,[staff(actor.discordId,'930')],request),{call:'930',source:'personeelslijst'});
});

test('100–199 are temporary units while 008 remains a valid administrative callsign',()=>{
  for(const value of ['100','110','150','195','199']){
    assert.equal(isTemporaryTOUnit(value),true,value);
    const radio=policeCall(value);
    assert.equal(radio.category,'SANTO');
    assert.equal(radio.number,value);
    assert.equal(radio.importable,true);
    assert.equal(validTOCall(value),true);
  }
  assert.equal(isTemporaryTOUnit('008'),false,'008 belongs to Belga administration');
  assert.equal(policeCall('008').importable,true,'008 remains a valid police radio unit');
  for(const bad of ['',null,'0','00000','200','0200','90000','100000','abc','-100'])
    assert.equal(isTemporaryTOUnit(bad),false,String(bad));
  assert.equal(temporaryTOCall('008'),false,'008 can be manually rostered but is not part of an officer-verified application range');
  assert.equal(temporaryTOCall('130'),true);
});

test('Server-controlled 930 overrides a client-typed TO name for start and takeover',()=>{
  const now=Date.UTC(2026,9,21);
  const operator={...actor,toCallsign:'930'};
  const started=applyBoardCommand(emptyBoard(),{type:'start',expectedRevision:0,displayName:'Mijn willekeurige naam'},
    {actor:operator,now,id:randomUUID()});
  assert.equal(started.board.session.to,'930');
  assert.equal(started.board.session.ownerUid,operator.uid);
  const handover={...actor,uid:'discord:222222222222222222',discordId:'222222222222222222',toCallsign:'008'};
  const requested=applyBoardCommand(started.board,{type:'request-takeover',expectedRevision:1,
    displayName:'Andere willekeurige naam',reason:'Overdracht tussen twee kaderleden.'},
    {actor:handover,now:now+5000,id:randomUUID()});
  assert.equal(requested.board.session.pendingTakeover.name,'008');
  assert.equal(requested.board.session.ownerUid,operator.uid);
  const next=applyBoardCommand(requested.board,{type:'approve-takeover',expectedRevision:2,
    requestId:requested.board.session.pendingTakeover.id},
    {actor:operator,now:now+6000,id:randomUUID()});
  assert.equal(next.board.session.to,'008');
  assert.equal(next.board.session.handovers[0].from,'930');
  assert.equal(next.board.session.handovers[0].to,'008');
  assert.equal(next.board.session.ownerUid,handover.uid);
});

test('Unlinked temporary TO and trainee units are allowed without changing access checks',()=>{
  let board=applyBoardCommand(emptyBoard(),{type:'start',expectedRevision:0,displayName:'008'},
    {actor,now:1,id:randomUUID()}).board;
  assert.equal(board.session.to,'008');
  for(const value of ['008','100','199']){
    board=applyBoardCommand(board,{type:'add-team',expectedRevision:board.revision,
      dienst:'SANTO',leden:[{naam:'Tijdelijke agent '+value,roep:value}]},
      {actor,now:board.revision+1,id:randomUUID()}).board;
  }
  assert.deepEqual(Object.values(board.ploegen).map(team=>team.roepnaam),['008','100','199']);
  const foreign={...actor,role:'basiskader',departmentRoles:{politie:'basiskader'},toCallsign:'008'};
  assert.throws(()=>applyBoardCommand(emptyBoard(),{type:'start',expectedRevision:0,
    displayName:'008'},{actor:foreign,now:1,id:randomUUID()}),
    err=>err.publicStatus===403,'Having a temporary number must not grant TO rights');
});

test('Belga 008 has the admin badge, while only 100–199 receive the temporary badge',()=>{
  const js=readFileSync(new URL('../public/to-dienstbord.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/to-dienstbord.css',import.meta.url),'utf8');
  assert.ok(js.includes("const managementPoliceCall=(category,number)"));
  assert.ok(js.includes("number==='008'"));
  assert.ok(js.includes('BELGA · BEHEER'));
  assert.ok(js.includes("Number(number)>=100&&Number(number)<=199"));
  assert.ok(js.includes('TIJDELIJK'));
  assert.ok(css.includes('.management-call-badge'));
  assert.ok(js.includes('This visual label NEVER grants privileges'));
});
