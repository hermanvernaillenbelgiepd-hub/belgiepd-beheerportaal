import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {
  TO_CATEGORIES,TO_BOARD_LIMITS,emptyBoard,canReadBoard,canOperateBoard,applyBoardCommand
} from '../src/to-board-policy.js';

const owner={uid:'discord:111111111111111111',role:'middenkader',departments:['politie'],departmentRoles:{politie:'middenkader'}};
const colleague={uid:'discord:222222222222222222',role:'officierenkader',departments:['politie'],departmentRoles:{politie:'officierenkader'}};
const now=Date.UTC(2026,9,20,10,0);
function command(board,type,data={},actor=owner,at=now){
  return applyBoardCommand(board,{type,expectedRevision:board.revision,...data},{actor,now:at,id:randomUUID()});
}
function started(){return command(emptyBoard(),'start',{displayName:'TO Test'}).board;}
function expectStatus(fn,status){assert.throws(fn,error=>error.publicStatus===status);}
function addTeam(board,roep='620',dienst='SANTO'){
  return command(board,'add-team',{dienst,leden:[{naam:'Agent Test',roep}]}).board;
}

test('Requested emergency and recovery categories can be saved without changing access policy',()=>{
  const categories=['AMBULANCE','AMBULANCE-MOTOR','PIT','MUG','MUGHELI','DIR-MED','SIT-TEAM','BRANDWEER','ZONE-COMM','PLOEG1','PLOEG2','PLOEG3','LSRA-DEPA100','LSRA-DEPAK200','LSRA-F.A.S.T.','LSRA-ANWV'];
  let board=addTeam(started());
  for(const category of categories){
    assert.equal(TO_CATEGORIES.includes(category),true,category);
    board=addTeam(board,'620',category);
  }
  assert.equal(Object.values(board.ploegen).length,17);
  assert.deepEqual(Object.values(board.ploegen).slice(1).map(team=>team.dienst),categories);
  expectStatus(()=>command(board,'add-team',{dienst:'LSRA-F.A.S.T.',leden:[{naam:'Dubbel Test',roep:'00620'}]}),409);
  const medicalUser={...owner,departments:['ambulance'],departmentRoles:{ambulance:'middenkader'}};
  expectStatus(()=>command(board,'add-team',{dienst:'AMBULANCE',leden:[{naam:'Test',roep:'621'}]},medicalUser),403);
});

test('The current TO can save BWM without granting brandweer accounts police board access',()=>{
  assert.equal(TO_CATEGORIES.includes('BWM'),true);
  let board=addTeam(started(),'620','SANTO');
  board=addTeam(board,'620','BWM');
  assert.deepEqual(Object.values(board.ploegen).map(team=>[team.dienst,team.roepnaam]),
    [['SANTO','620'],['BWM','620']]);
  expectStatus(()=>command(board,'add-team',{dienst:'BWM',leden:[{naam:'Dubbel Test',roep:'00620'}]}),409);
  const fireUser={...owner,departments:['brandweer'],departmentRoles:{brandweer:'middenkader'}};
  assert.equal(canReadBoard(fireUser),false);
  expectStatus(()=>command(board,'add-team',{dienst:'BWM',leden:[{naam:'Brandweer Test',roep:'621'}]},fireUser),403);
});

function createIncident(board){
  return command(board,'create-incident',{postcode:'7042',titel:'Testmelding',omschrijving:'Een testmelding zonder echte persoonsgegevens.'}).board;
}

test('TO board rights are scoped to police; another department never supplies operator rights',()=>{
  const reader={...owner,role:'basiskader',departmentRoles:{politie:'basiskader'}};
  assert.equal(canReadBoard(reader),true);
  assert.equal(canOperateBoard(reader),false);
  assert.equal(canReadBoard(owner),true);
  assert.equal(canOperateBoard(owner),true);
  for(const actor of [null,{...owner,departments:['ambulance'],departmentRoles:{ambulance:'beheerder'}},
    {...owner,role:'beheerder',departments:['politie','ambulance'],departmentRoles:{politie:'burger',ambulance:'beheerder'}},
    {...owner,role:'korpsleiding',departments:['politie','ambulance'],departmentRoles:{}},
    {...owner,role:'burger',departmentRoles:{politie:'burger'}}]){
    assert.equal(canReadBoard(actor),false);
    assert.equal(canOperateBoard(actor),false);
  }
  assert.equal(canOperateBoard({...owner,role:'beheerder',departments:['politie','ambulance'],departmentRoles:{politie:'basiskader',ambulance:'beheerder'}}),false);
});

test('Starting a TO session uses the authenticated UID, server time and a fresh server ID',()=>{
  const initial=emptyBoard(),before=structuredClone(initial);
  const result=command(initial,'start',{displayName:'  TO Test  '});
  assert.deepEqual(initial,before,'A rejected or accepted proposal must not mutate the persisted input');
  assert.equal(result.board.session.ownerUid,owner.uid);
  assert.equal(result.board.session.to,'TO Test');
  assert.equal(result.board.session.startedAt,now);
  assert.ok(result.board.session.id);
  assert.equal(result.board.revision,1);
  assert.equal(result.archive,null);
  expectStatus(()=>command(initial,'start',{displayName:'TO',ownerUid:colleague.uid}),400);
  expectStatus(()=>command(initial,'start',{displayName:'TO',startedAt:1}),400);
  expectStatus(()=>command(initial,'start',{displayName:'TO'}, {...owner,uid:''}),403);
  expectStatus(()=>command(result.board,'start',{displayName:'Tweede TO'}),409);
});

test('Every command requires a numeric current revision and rejects stale writes',()=>{
  const board=started();
  for(const revision of [-1,'1',1.5,null,undefined]){
    expectStatus(()=>applyBoardCommand(board,{type:'close-session',expectedRevision:revision},{actor:owner,now,id:randomUUID()}),400);
  }
  expectStatus(()=>applyBoardCommand(board,{type:'close-session',expectedRevision:0},{actor:owner,now,id:randomUUID()}),409);
  expectStatus(()=>command(board,'unknown-operation'),400);
  expectStatus(()=>command(board,'close-session',{revision:board.revision}),400);
});

test('Confirmed handover works immediately even if current TO is offline',()=>{
  let board=started();
  board=command(board,'add-team',{dienst:'SANTO',leden:[{naam:'Agent',roep:'1'}]}).board;
  const originalTeams=structuredClone(board.ploegen);
  expectStatus(()=>command(board,'add-team',{dienst:'SANTO',leden:[{naam:'Other',roep:'2'}]},colleague),403);
  expectStatus(()=>command(board,'takeover',{displayName:'TO Test'},colleague),400);
  expectStatus(()=>command(board,'takeover',{displayName:'TO Test',confirmation:'neen'},colleague),400);
  expectStatus(()=>command(board,'request-takeover',{displayName:'TO Test',reason:'kort'},colleague),400);
  const previous=board.session.ownerUid;
  board=command(board,'takeover',{displayName:'TO Test',confirmation:'JA_OVERNAME'},colleague,now+60000).board;
  assert.equal(board.session.ownerUid,colleague.uid);
  assert.equal(board.session.to,'TO Test');
  assert.equal(board.session.handovers.length,1);
  assert.equal(board.session.handovers[0].mode,'bevestigd');
  assert.equal(board.session.handovers[0].fromUid,previous);
  assert.equal(board.session.handovers[0].toUid,colleague.uid);
  assert.equal(board.session.handovers[0].byUid,colleague.uid);
  assert.equal(board.session.handovers[0].at,now+60000);
  assert.deepEqual(board.ploegen,originalTeams,'Teams are retained');
  expectStatus(()=>command(board,'close-session',{},owner),403);
  expectStatus(()=>command(board,'takeover',{displayName:'TO Test',confirmation:'JA_OVERNAME'},colleague),409);
});

test('Paired crews derive their numeric callsign and prevent duplicate officers within a category',()=>{
  assert.equal(TO_CATEGORIES.includes('SANTO'),true);
  let board=command(started(),'add-team',{dienst:'SANTO',leden:[{naam:'Agent A',roep:'620'},{naam:'Agent B',roep:'1000'}]}).board;
  const team=Object.values(board.ploegen)[0];
  assert.equal(team.roepnaam,'1000');
  assert.equal(team.koppel,true);
  assert.equal(team.available,true);
  assert.equal(team.createdAt,now);
  expectStatus(()=>command(board,'add-team',{dienst:'SANTO',leden:[{naam:'Dubbel',roep:'00620'}]}),409);
  expectStatus(()=>command(board,'add-team',{dienst:'SANTO',leden:[{naam:'Dubbel A',roep:'42'},{naam:'Dubbel B',roep:'00042'}]}),400);
  expectStatus(()=>command(board,'add-team',{dienst:'SANTO',leden:[{naam:'Agent',roep:'A620'}]}),400);
  expectStatus(()=>command(board,'add-team',{dienst:'GEEN-CATEGORIE',leden:[{naam:'Agent',roep:'77'}]}),400);
  expectStatus(()=>command(board,'add-team',{dienst:'SANTO',leden:[{naam:'Agent',roep:'77',role:'beheerder'}]}),400);
  board=addTeam(board,'620','BLAINE');
  assert.equal(Object.values(board.ploegen).length,2,'A different patrol category may use the same callsign');
});

test('Incident assignments keep snapshots and prevent retiring a crew on an active incident',()=>{
  let board=createIncident(addTeam(started()));
  const [team]=Object.values(board.ploegen),[incident]=Object.values(board.meldingen);
  assert.equal(incident.nr,1);
  assert.equal(incident.createdAt,now);
  assert.ok(incident.log.length>0);
  board=command(board,'attach-team',{id:incident.id,teamId:team.id}).board;
  assert.deepEqual(board.meldingen[incident.id].ploegen[0],{id:team.id,dienst:'SANTO',roep:'620'});
  expectStatus(()=>command(board,'remove-team',{id:team.id}),409);
  expectStatus(()=>command(board,'close-session'),409);
  board=command(board,'incident-status',{id:incident.id,status:'niet-actief'}).board;
  board=command(board,'remove-team',{id:team.id},owner,now+120000).board;
  assert.equal(board.ploegen[team.id].endedAt,now+120000);
  assert.equal(board.meldingen[incident.id].ploegen[0].roep,'620','Historical assignment remains readable');
  expectStatus(()=>command(board,'toggle-team',{id:team.id,available:true}),409);
});

test('Incident sequence and field validation cannot be overridden by a client',()=>{
  let board=createIncident(started());
  board=createIncident(board);
  assert.deepEqual(Object.values(board.meldingen).map(m=>m.nr),[1,2]);
  expectStatus(()=>command(board,'create-incident',{postcode:'7042',titel:'Titel',omschrijving:'',nr:999}),400);
  expectStatus(()=>command(board,'create-incident',{postcode:'7042',titel:'Titel',omschrijving:'',createdAt:1}),400);
  expectStatus(()=>command(board,'create-incident',{postcode:'7042',titel:'<script>test</script>',omschrijving:''}),400);
  expectStatus(()=>command(board,'create-incident',{postcode:'7042',titel:'Titel',omschrijving:'x'.repeat(2001)}),400);
  const incident=Object.values(board.meldingen)[0];
  expectStatus(()=>command(board,'incident-status',{id:incident.id,status:'verwijderd'}),400);
  expectStatus(()=>command(board,'update-incident',{id:incident.id,postcode:'7043',titel:'Nieuw',omschrijving:'',by:'Andere TO'}),400);
});

test('Finishing archives the whole service without losing retired crews or handing the next TO stale calls',()=>{
  let board=createIncident(addTeam(started()));
  const team=Object.values(board.ploegen)[0],incident=Object.values(board.meldingen)[0];
  board=command(board,'attach-team',{id:incident.id,teamId:team.id}).board;
  board=command(board,'incident-status',{id:incident.id,status:'niet-actief'}).board;
  board=command(board,'remove-team',{id:team.id},owner,now+60000).board;
  const before=structuredClone(board),result=command(board,'close-session',{},owner,now+300000);
  assert.deepEqual(board,before);
  assert.ok(result.archive);
  assert.equal(result.archive.id,before.session.id);
  assert.equal(result.archive.closedAt,now+300000);
  assert.ok(result.archive.ploegen[team.id]);
  assert.ok(result.archive.meldingen[incident.id]);
  assert.equal(result.board.session,null);
  assert.deepEqual(result.board.ploegen,{});
  assert.deepEqual(result.board.meldingen,{});
  assert.equal(result.board.revision,before.revision+1);
  const restarted=command(result.board,'start',{displayName:'Volgende TO'}).board;
  assert.notEqual(restarted.session.id,before.session.id);
  assert.deepEqual(restarted.meldingen,{});
});

test('A full incident log refuses further edits but still allows completion and lossless archiving',()=>{
  let board=createIncident(started());
  const incident=Object.values(board.meldingen)[0];
  const entries=Array.from({length:TO_BOARD_LIMITS.incidentLog},(_,index)=>({t:now+index,by:owner.uid,actorUid:owner.uid,txt:'Bestaande logregel '+index}));
  board.meldingen[incident.id].log=structuredClone(entries);
  expectStatus(()=>command(board,'update-incident',{id:incident.id,postcode:'7042',titel:'Gewijzigd',omschrijving:''}),413);
  board=command(board,'incident-status',{id:incident.id,status:'niet-actief'},owner,now+5000).board;
  assert.equal(board.meldingen[incident.id].closedBy,owner.uid);
  const archived=command(board,'close-session',{},owner,now+6000).archive;
  assert.deepEqual(archived.meldingen[incident.id].log,entries,'Existing audit entries must not be silently truncated');
});

test('Active crew bounds reject excess state without changing the saved board',()=>{
  let board=started();
  for(let index=1;index<=TO_BOARD_LIMITS.activeTeams;index++)board=addTeam(board,String(index));
  const before=structuredClone(board);
  expectStatus(()=>addTeam(board,String(TO_BOARD_LIMITS.activeTeams+1)),413);
  assert.deepEqual(board,before);
  const retired=Object.values(board.ploegen)[0];
  board=command(board,'remove-team',{id:retired.id}).board;
  board=addTeam(board,String(TO_BOARD_LIMITS.activeTeams+1));
  assert.equal(Object.values(board.ploegen).filter(team=>!team.endedAt).length,TO_BOARD_LIMITS.activeTeams);
  assert.equal(Object.keys(board.ploegen).length,TO_BOARD_LIMITS.activeTeams+1,'The retired crew remains in history');
});

test('A nearly full accepted board always has room to finish its incidents and archive',()=>{
  const seed=createIncident(started()),activeId=Object.keys(seed.meldingen)[0];
  const historicalIds=Array.from({length:100},()=>randomUUID());
  const entry=(txt,t=now)=>({t,by:owner.uid,actorUid:owner.uid,txt});
  function fixture(extraEntries){
    const board=structuredClone(seed);
    board.revision=10000;
    for(const [index,id] of historicalIds.entries()){
      const updates=Math.min(extraEntries,TO_BOARD_LIMITS.incidentLog-2);
      extraEntries-=updates;
      board.meldingen[id]={id,nr:index+2,postcode:'7042',titel:'Historische testmelding',omschrijving:'x'.repeat(2000),status:'niet-actief',ploegen:[],createdAt:now,by:owner.uid,
        log:[entry('Melding aangemaakt'),...Array.from({length:updates},()=>entry('Gegevens aangepast')),entry('Status gewijzigd naar niet-actief')],updatedAt:now,closedAt:now,closedBy:owner.uid};
    }
    board.nextIncidentNumber=historicalIds.length+2;
    return board;
  }
  function growth(extraEntries){
    return command(fixture(extraEntries),'update-incident',{id:activeId,postcode:'7042',titel:'Actieve testmelding',omschrijving:'y'.repeat(2000)}).board;
  }
  // Construct legitimate historical shapes and find the acceptance boundary
  // without replaying thousands of unrelated mutation commands.
  let low=0,high=historicalIds.length*(TO_BOARD_LIMITS.incidentLog-2),accepted=null;
  while(low<=high){
    const middle=Math.floor((low+high)/2);
    try{accepted=growth(middle);low=middle+1;}
    catch(error){assert.equal(error.publicStatus,413);high=middle-1;}
  }
  assert.ok(accepted);
  assert.ok(Buffer.byteLength(JSON.stringify(accepted),'utf8')>TO_BOARD_LIMITS.bytes-5000,'The regression must exercise a board near the actual byte boundary');
  expectStatus(()=>command(accepted,'update-incident',{id:activeId,postcode:'7042',titel:'Actieve testmelding',omschrijving:'y'.repeat(2000)}),413);
  const completed=command(accepted,'incident-status',{id:activeId,status:'niet-actief'}).board;
  const result=command(completed,'close-session');
  assert.equal(result.board.session,null);
  assert.equal(Object.keys(result.archive.meldingen).length,historicalIds.length+1);
  assert.equal(result.archive.meldingen[activeId].status,'niet-actief');
  assert.ok(Buffer.byteLength(JSON.stringify(result.archive),'utf8')<=TO_BOARD_LIMITS.archiveBytes);
});


test('Click-based response phases require underway before on scene and an explicit reset',()=>{
  let board=addTeam(started(),'930','SANTO');
  const team=Object.values(board.ploegen)[0],original=structuredClone(board);
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:'ter-plaatse'}),409);
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:'vrij'}),400);
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:null}),409);
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:'onderweg',ownerUid:owner.uid}),400);
  board=command(board,'response-phase',{id:team.id,phase:'onderweg'}).board;
  assert.deepEqual(original.ploegen[team.id].responsePhase,null,'Previous revision remains immutable');
  assert.equal(board.ploegen[team.id].responsePhase,'onderweg');
  assert.equal(board.ploegen[team.id].responseBy,owner.uid);
  assert.equal(board.ploegen[team.id].responseAt,now);
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:'onderweg'}),409);
  expectStatus(()=>command(board,'toggle-team',{id:team.id,available:false}),409);
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:'ter-plaatse'},colleague),403);
  board=command(board,'response-phase',{id:team.id,phase:'ter-plaatse'}).board;
  assert.equal(board.ploegen[team.id].responsePhase,'ter-plaatse');
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:'onderweg'}),409,
    'Accidental third click should not mark a crew free');
  board=command(board,'response-phase',{id:team.id,phase:null}).board;
  assert.equal(board.ploegen[team.id].responsePhase,null);
  board=command(board,'toggle-team',{id:team.id,available:false}).board;
  expectStatus(()=>command(board,'response-phase',{id:team.id,phase:'onderweg'}),409);
});

test('Team stage changes are audited on active incidents and closing clears the final response',()=>{
  let board=createIncident(addTeam(started(),'930'));
  const team=Object.values(board.ploegen)[0],incident=Object.values(board.meldingen)[0];
  board=command(board,'attach-team',{id:incident.id,teamId:team.id}).board;
  board=command(board,'response-phase',{id:team.id,phase:'onderweg'}).board;
  board=command(board,'response-phase',{id:team.id,phase:'ter-plaatse'}).board;
  let lines=board.meldingen[incident.id].log.map(x=>x.txt);
  assert.ok(lines.some(s=>s.includes('SANTO-930: onderweg')));
  assert.ok(lines.some(s=>s.includes('SANTO-930: ter plaatse')));
  assert.equal(board.ploegen[team.id].responsePhase,'ter-plaatse');
  board=command(board,'incident-status',{id:incident.id,status:'niet-actief'}).board;
  assert.equal(board.ploegen[team.id].responsePhase,null,'Closing last linked incident resets response beacon');
  board=command(board,'remove-team',{id:team.id}).board;
  assert.equal(board.ploegen[team.id].endedAt,now);
});

test('Detaching the last active incident clears response; another active call preserves it',()=>{
  let board=createIncident(addTeam(started(),'166'));
  const team=Object.values(board.ploegen)[0],first=Object.values(board.meldingen)[0];
  board=createIncident(board);
  const second=Object.values(board.meldingen).find(x=>x.id!==first.id);
  board=command(board,'attach-team',{id:first.id,teamId:team.id}).board;
  board=command(board,'attach-team',{id:second.id,teamId:team.id}).board;
  board=command(board,'response-phase',{id:team.id,phase:'onderweg'}).board;
  board=command(board,'detach-team',{id:first.id,teamId:team.id}).board;
  assert.equal(board.ploegen[team.id].responsePhase,'onderweg');
  board=command(board,'detach-team',{id:second.id,teamId:team.id}).board;
  assert.equal(board.ploegen[team.id].responsePhase,null);
});

test('Changing incident response remains possible when its log has reached the limit',()=>{
  let board=createIncident(addTeam(started(),'930'));
  const team=Object.values(board.ploegen)[0],incident=Object.values(board.meldingen)[0];
  board=command(board,'attach-team',{id:incident.id,teamId:team.id}).board;
  const full=structuredClone(board);
  full.meldingen[incident.id].log=Array.from({length:TO_BOARD_LIMITS.incidentLog},()=>({
    t:now,by:owner.uid,actorUid:owner.uid,txt:'Oude loglijn'
  }));
  // A crowded log does not prevent a unit acknowledging its actual location.
  const next=command(full,'response-phase',{id:team.id,phase:'onderweg'}).board;
  assert.equal(next.ploegen[team.id].responsePhase,'onderweg');
  assert.equal(next.meldingen[incident.id].log.length,TO_BOARD_LIMITS.incidentLog);
});


test('Immediate takeover replaces legacy pending requests and rejects unauthorized attempts',()=>{
  let board=started();
  board.session.pendingTakeover={
    id:'12345678-1234-4123-8123-123456789012',
    requesterUid:colleague.uid,name:'Andere collega',reason:'Oud verzoek',
    requestedAt:now-3000,expiresAt:now+60000,originalOwnerUid:owner.uid
  };
  expectStatus(()=>command(board,'approve-takeover',{requestId:board.session.pendingTakeover.id},owner),400);
  expectStatus(()=>command(board,'emergency-takeover',{requestId:board.session.pendingTakeover.id,confirmation:'NOODOVERNAME',reason:'test'},colleague),400);
  const reader={...colleague,role:'basiskader',departmentRoles:{politie:'basiskader'}};
  expectStatus(()=>command(board,'takeover',{displayName:'Collega',confirmation:'JA_OVERNAME'},reader),403);
  board=command(board,'takeover',{displayName:'Collega',confirmation:'JA_OVERNAME'},colleague).board;
  assert.equal(board.session.pendingTakeover,undefined);
  assert.equal(board.session.ownerUid,colleague.uid);
  assert.equal(board.session.handovers.at(-1).mode,'bevestigd');
});

test('Every crew status may be chosen directly without a forced underway or reset sequence',()=>{
  let board=addTeam(started(),'930');
  const id=Object.values(board.ploegen)[0].id;
  const transitions=[
    ['ter-plaatse',true,'ter-plaatse'],
    ['pauze',false,null],
    ['onderweg',true,'onderweg'],
    ['beschikbaar',true,null],
    ['pauze',false,null],
    ['ter-plaatse',true,'ter-plaatse'],
    ['beschikbaar',true,null]
  ];
  for(const [status,available,phase] of transitions){
    board=command(board,'set-team-status',{id,status}).board;
    assert.equal(board.ploegen[id].available,available,status);
    assert.equal(board.ploegen[id].responsePhase,phase,status);
    assert.equal(board.ploegen[id].responseBy,owner.uid,status);
    assert.equal(board.ploegen[id].updatedBy,owner.uid,status);
  }
  expectStatus(()=>command(board,'set-team-status',{id,status:'beschikbaar'}),409);
  expectStatus(()=>command(board,'set-team-status',{id,status:'onbekend'}),400);
  expectStatus(()=>command(board,'set-team-status',{id,status:'pauze',ownerUid:owner.uid}),400);
  expectStatus(()=>command(board,'set-team-status',{id,status:'pauze'},colleague),403);
});

test('Direct choice never deletes active incident assignment or its history',()=>{
  let board=createIncident(addTeam(started(),'930'));
  const team=Object.values(board.ploegen)[0],incident=Object.values(board.meldingen)[0];
  board=command(board,'attach-team',{id:incident.id,teamId:team.id}).board;
  const oldLength=board.meldingen[incident.id].log.length;
  board=command(board,'set-team-status',{id:team.id,status:'ter-plaatse'}).board;
  board=command(board,'set-team-status',{id:team.id,status:'pauze'}).board;
  board=command(board,'set-team-status',{id:team.id,status:'beschikbaar'}).board;
  const current=board.meldingen[incident.id];
  assert.equal(current.status,'actief');
  assert.equal(current.ploegen[0].id,team.id,'Team remains assigned until manually detached');
  assert.equal(current.log.length,oldLength+3);
  assert.ok(current.log.some(item=>item.txt.includes('status ter plaatse')));
  assert.ok(current.log.some(item=>item.txt.includes('status pauze / niet beschikbaar')));
  assert.equal(board.ploegen[team.id].responsePhase,null);
  assert.equal(board.ploegen[team.id].available,true);
  board=command(board,'detach-team',{id:incident.id,teamId:team.id}).board;
  assert.equal(board.meldingen[incident.id].ploegen.length,0);
});

test('Only teams explicitly imported through radio carry an auto-signoff source marker',()=>{
  let board=started();
  board=command(board,'add-team',{dienst:'SANTO',
    leden:[{naam:'Radiogebruiker',roep:'180'}],radioSource:'sonoran'}).board;
  const imported=Object.values(board.ploegen)[0];
  assert.equal(imported.radioSource,'sonoran');
  board=command(board,'add-team',{dienst:'REPA',
    leden:[{naam:'Manueel toegevoegd',roep:'204'}]}).board;
  const manual=Object.values(board.ploegen).find(team=>team.dienst==='REPA');
  assert.equal(manual.radioSource,undefined);
  expectStatus(()=>command(board,'add-team',{dienst:'SANTO',
    leden:[{naam:'Niet toegestaan',roep:'181'}],radioSource:'anders'}),400);
});


test('Named HVPK is a deployable ambulance team without a synthetic numeric callsign',()=>{
  let board=started();
  board=command(board,'add-team',{dienst:'HVPK',leden:[{naam:'Stan',roep:'HVPK'}],radioSource:'sonoran'}).board;
  const unit=Object.values(board.ploegen)[0];
  assert.equal(unit.roepnaam,'HVPK');
  assert.equal(unit.dienst,'HVPK');
  assert.equal(unit.radioSource,'sonoran');
  expectStatus(()=>command(board,'add-team',{dienst:'HVPK',
    leden:[{naam:'Andere verpleegkundige',roep:'HVPK'}]}),409);
  board=command(board,'add-team',{dienst:'HVPK',
    leden:[{naam:'Ambulancier',roep:'123'}]}).board;
  assert.equal(Object.values(board.ploegen).length,2);
});

test('Named verified brandweer commander can read TO only; permissions never propagate to police writes',()=>{
  const id='301448301868220417';
  const old=process.env.BPD_TO_READONLY_DISCORD_IDS;
  const zone={uid:'discord:'+id,discordId:id,role:'korpsleiding',
    departments:['brandweer'],departmentRoles:{brandweer:'korpsleiding'}};
  try {
    process.env.BPD_TO_READONLY_DISCORD_IDS=id;
    assert.equal(canReadBoard(zone),true);
    assert.equal(canOperateBoard(zone),false);
    expectStatus(()=>command(started(),'add-team',{dienst:'BWM',
      leden:[{naam:'Testmedewerker',roep:'625'}]},zone),403);
    assert.equal(canReadBoard({...zone,uid:'discord:999999999999999999'}),false);
    assert.equal(canReadBoard({...zone,discordId:'999999999999999999'}),false);
    assert.equal(canReadBoard({...zone,departments:['ambulance'],departmentRoles:{ambulance:'korpsleiding'}}),false);
    assert.equal(canReadBoard({...zone,discordId:'3014483018682204179',uid:'discord:3014483018682204179'}),false);
  } finally {
    if(old===undefined)delete process.env.BPD_TO_READONLY_DISCORD_IDS;
    else process.env.BPD_TO_READONLY_DISCORD_IDS=old;
  }
});
