import {roleForDepartment} from './leave-policy.js';
import {TO_CATEGORIES} from '../public/to-categories.js';

// Operational labels do not grant access to another department.
export {TO_CATEGORIES};
export const TO_BOARD_LIMITS=Object.freeze({activeTeams:100,teams:300,incidents:200,incidentLog:100,handovers:100,bytes:700*1024,archiveBytes:708*1024});
const READ_ROLES=new Set(['basiskader','middenkader','officierenkader','korpsleiding','beheerder']);
const OPERATE_ROLES=new Set(['middenkader','officierenkader','korpsleiding','beheerder']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CONTROL=/[\x00-\x1f\x7f<>]/;
const COMMAND_FIELDS=Object.freeze({
  start:['displayName'],
  takeover:['displayName','confirmation'],
  'add-team':['dienst','leden','radioSource'],'remove-team':['id'],'toggle-team':['id','available'],
  'response-phase':['id','phase'],
  'set-team-status':['id','status'],
  'create-incident':['postcode','titel','omschrijving'],
  'update-incident':['id','postcode','titel','omschrijving'],
  'incident-status':['id','status'],'attach-team':['id','teamId'],'detach-team':['id','teamId'],
  'close-session':[]
});

export function boardError(status,message){return Object.assign(new Error(message),{publicStatus:status});}
const fail=(status,message)=>{throw boardError(status,message);};
export function canReadBoard(actor){
  return READ_ROLES.has(actor?.role)&&READ_ROLES.has(roleForDepartment(actor,'politie'));
}
export function canOperateBoard(actor){
  return OPERATE_ROLES.has(actor?.role)&&OPERATE_ROLES.has(roleForDepartment(actor,'politie'));
}
export function emptyBoard(){return {revision:0,session:null,ploegen:{},meldingen:{},nextIncidentNumber:1};}
export function validBoardId(id){return typeof id==='string'&&UUID.test(id);}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
function keys(value,allowed,message='Onbekend of niet-toegelaten veld'){
  if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(400,message);
}
function text(value,min,max,label,{multiline=false}={}){
  if(typeof value!=='string')fail(400,label+' is ongeldig');
  const result=multiline?value.trim():value.trim().replace(/\s+/g,' ');
  const bad=multiline?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/:CONTROL;
  if(result.length<min||result.length>max||bad.test(value))fail(400,label+' is ongeldig');
  return result;
}
function entityId(value){if(!validBoardId(value))fail(400,'Ongeldige verwijzing');return value;}
// A personnel-verified callsign is assigned by the server and takes precedence
// over displayName supplied by the browser. Board authorization still uses UID.
function toDisplayName(actor,raw){
  const supplied=text(raw,2,80,'TO-naam');
  const verified=actor?.toCallsign;
  return typeof verified==='string'&&/^\d{1,5}$/.test(verified)&&Number(verified)>0?verified:supplied;
}
function capacity(board){
  if(Object.keys(board.ploegen).length>TO_BOARD_LIMITS.teams||Object.keys(board.meldingen).length>TO_BOARD_LIMITS.incidents)
    fail(413,'Deze dienst bevat te veel gegevens. Sluit meldingen af en archiveer de dienst.');
  if(Buffer.byteLength(JSON.stringify(board),'utf8')>TO_BOARD_LIMITS.bytes)
    fail(413,'Deze dienst is te groot. Sluit meldingen af en archiveer de dienst.');
  // Reserve enough space to finish every active incident, even after a handover
  // to a user with a longer UID. A JSON string expands by at most six bytes per
  // UTF-16 code unit; UID validation below caps that length at 128.
  const terminal=structuredClone(board),reservedUid='x'.repeat(6*128),reservedTime=Number.MAX_SAFE_INTEGER;
  for(const incident of Object.values(terminal.meldingen)){
    if(incident.status!=='actief')continue;
    if(incident.log.length<TO_BOARD_LIMITS.incidentLog)
      incident.log.push({t:reservedTime,by:reservedUid,actorUid:reservedUid,txt:'Status gewijzigd naar niet-actief'});
    Object.assign(incident,{status:'niet-actief',updatedAt:reservedTime,closedAt:reservedTime,closedBy:reservedUid});
  }
  if(Buffer.byteLength(JSON.stringify(terminal),'utf8')>TO_BOARD_LIMITS.bytes)
    fail(413,'De dienst heeft onvoldoende ruimte voor verdere gegevens. Rond meldingen af en archiveer de dienst.');
}
function incidentFields(cmd){
  const postcode=text(cmd.postcode,1,8,'Postcode');
  if(!/^\d{1,8}$/.test(postcode))fail(400,'Postcode mag alleen cijfers bevatten');
  return {postcode,titel:text(cmd.titel,1,80,'Titel'),omschrijving:text(cmd.omschrijving,0,2000,'Omschrijving',{multiline:true})};
}
function appendLog(incident,actor,now,txt){
  if(incident.log.length>=TO_BOARD_LIMITS.incidentLog)fail(413,'Het logboek van deze melding is vol. Rond de melding af.');
  incident.log.push({t:now,by:actor.uid,actorUid:actor.uid,txt});
}
function getIncident(board,id){
  const incident=board.meldingen[entityId(id)];
  if(!incident)fail(409,'Deze melding bestaat niet meer. Vernieuw het dienstbord.');
  return incident;
}
function getTeam(board,id){
  const team=board.ploegen[entityId(id)];
  if(!team||team.endedAt)fail(409,'Deze ploeg is niet meer in dienst. Vernieuw het dienstbord.');
  return team;
}

// The entire live board is one revisioned document. Pure policy never trusts
// client-provided IDs, timestamps, names of actors, or replacement board state.
export function applyBoardCommand(current,cmd,{actor,now,id}={}){
  if(!canOperateBoard(actor))fail(403,'Geen bevoegdheid om het politiedienstbord te bedienen');
  if(typeof actor.uid!=='string'||!actor.uid||actor.uid.length>128||CONTROL.test(actor.uid))fail(403,'Geverifieerde portaalidentiteit ontbreekt');
  if(!Number.isSafeInteger(now)||now<1)throw new Error('Server timestamp ontbreekt');
  if(!plain(cmd)||typeof cmd.type!=='string'||!Object.hasOwn(COMMAND_FIELDS,cmd.type))fail(400,'Onbekende dienstbordopdracht');
  keys(cmd,['type','expectedRevision',...COMMAND_FIELDS[cmd.type]]);
  if(!Number.isSafeInteger(cmd.expectedRevision)||cmd.expectedRevision<0)fail(400,'Een geldige verwachte revisie is vereist');
  const source=current??emptyBoard();
  if(!Number.isSafeInteger(source.revision)||source.revision<0)throw new Error('Ongeldige opgeslagen dienstbordrevisie');
  if(cmd.expectedRevision!==source.revision)fail(409,'Het dienstbord is gewijzigd. Vernieuw het bord en probeer opnieuw.');
  if(!Number.isSafeInteger(source.revision+1))fail(413,'Revisielimiet bereikt');
  const board=structuredClone(source);
  if(!plain(board.ploegen)||!plain(board.meldingen)||!Number.isSafeInteger(board.nextIncidentNumber)||board.nextIncidentNumber<1)
    throw new Error('Ongeldig opgeslagen dienstbord');
  const newId=()=>{
    const value=typeof id==='function'?id():id;
    if(!validBoardId(value))throw new Error('Geldige server-ID ontbreekt');
    return value;
  };
  if(cmd.type==='start'){
    if(board.session)fail(409,'Er loopt al een dienst. Neem deze eerst over.');
    board.session={id:newId(),to:toDisplayName(actor,cmd.displayName),ownerUid:actor.uid,startedAt:now,handovers:[]};
  }else{
    if(!board.session)fail(409,'Er loopt geen dienst. Start eerst een dienst.');
    if(cmd.type==='takeover'){
      if(board.session.ownerUid===actor.uid)fail(409,'Je bent al TO van dienst');
      if(cmd.confirmation!=='JA_OVERNAME')fail(400,'Bevestig de dienstovername in het venster');
      const name=toDisplayName(actor,cmd.displayName);
      if(board.session.handovers.length>=TO_BOARD_LIMITS.handovers)
        fail(413,'Te veel overdrachten. Rond deze dienst eerst af.');
      const previousName=board.session.to,previousUid=board.session.ownerUid;
      board.session.handovers.push({
        from:previousName,to:name,fromUid:previousUid,toUid:actor.uid,
        byUid:actor.uid,at:now,reason:'Vrijwillige, bevestigde dienstovername',
        mode:'bevestigd'
      });
      board.session.to=name;
      board.session.ownerUid=actor.uid;
      // Clean up any legacy outstanding requests during migration.
      delete board.session.pendingTakeover;
    }else{
      if(board.session.ownerUid!==actor.uid)fail(403,'Alleen de huidige TO kan deze dienst wijzigen. Neem de dienst eerst over.');
      if(cmd.type==='add-team'){
        if(cmd.radioSource!==undefined&&cmd.radioSource!=='sonoran')fail(400,'Ongeldige radiobron');
        if(!TO_CATEGORIES.includes(cmd.dienst))fail(400,'Onbekende ploegcategorie');
        if(!Array.isArray(cmd.leden)||cmd.leden.length<1||cmd.leden.length>2)fail(400,'Een ploeg bestaat uit één of twee agenten');
        const leden=cmd.leden.map(member=>{
          keys(member,['naam','roep']);
          const naam=text(member.naam,2,80,'Agentnaam'),roep=text(member.roep,1,5,'Roepnummer');
          if(!(/^\d{1,5}$/.test(roep)&&Number(roep)>0)&&!(['HARTS','HVPK'].includes(cmd.dienst)&&roep===cmd.dienst))fail(400,'Roepnummer moet één tot vijf cijfers bevatten, behalve de benoemde HARTS- en HVPK-eenheden');
          return {naam,roep};
        });
        if(new Set(leden.map(member=>(['HARTS','HVPK'].includes(cmd.dienst)&&member.roep===cmd.dienst)?cmd.dienst:String(Number(member.roep)))).size!==leden.length)fail(400,'Elke agent in een koppel heeft een eigen roepnummer');
        const activeTeams=Object.values(board.ploegen).filter(team=>!team.endedAt);
        if(activeTeams.length>=TO_BOARD_LIMITS.activeTeams)fail(413,'Er zijn al te veel ploegen in dienst');
        if(activeTeams.some(team=>team.dienst===cmd.dienst&&team.leden.some(member=>leden.some(added=>(member.roep===cmd.dienst||added.roep===cmd.dienst?member.roep===added.roep:Number(member.roep)===Number(added.roep))))))
          fail(409,'Dit roepnummer is al in dienst binnen deze categorie');
        const teamId=newId();
        if(Object.hasOwn(board.ploegen,teamId))throw new Error('Dubbele server-ID');
        const roepnaam=['HARTS','HVPK'].includes(cmd.dienst)&&leden.some(member=>member.roep===cmd.dienst)?cmd.dienst:leden.reduce((highest,member)=>Number(member.roep)>Number(highest)?member.roep:highest,leden[0].roep);
        board.ploegen[teamId]={id:teamId,dienst:cmd.dienst,leden,koppel:leden.length===2,roepnaam,createdAt:now,by:actor.uid,available:true,responsePhase:null,...(cmd.radioSource==='sonoran'?{radioSource:'sonoran'}:{})};
      }else if(cmd.type==='remove-team'){
        const team=getTeam(board,cmd.id);
        if(Object.values(board.meldingen).some(incident=>incident.status==='actief'&&incident.ploegen.some(reference=>reference.id===team.id)))
          fail(409,'Ontkoppel deze ploeg eerst van actieve meldingen of rond die meldingen af');
        team.endedAt=now;team.endedBy=actor.uid;team.available=false;team.responsePhase=null;
      }else if(cmd.type==='toggle-team'){
        if(typeof cmd.available!=='boolean')fail(400,'Beschikbaarheid moet waar of onwaar zijn');
        const team=getTeam(board,cmd.id);
        if(team.responsePhase)fail(409,'Wis eerst de uitrukstatus alvorens de beschikbaarheid aan te passen');
        Object.assign(team,{available:cmd.available,updatedAt:now,updatedBy:actor.uid});
      }else if(cmd.type==='set-team-status'){
        // Every status is an independent explicit action, not a forced cycle.
        // Never silently detach a unit from an active incident or close that
        // incident; assignments are managed separately and remain auditable.
        const labels={onderweg:'onderweg','ter-plaatse':'ter plaatse',pauze:'pauze / niet beschikbaar',beschikbaar:'beschikbaar'};
        if(typeof cmd.status!=='string'||!Object.hasOwn(labels,cmd.status))
          fail(400,'Ongeldige ploegstatus');
        const team=getTeam(board,cmd.id);
        const previous=team.responsePhase==='onderweg'||team.responsePhase==='ter-plaatse'
          ?team.responsePhase:team.available===false?'pauze':'beschikbaar';
        if(previous===cmd.status)fail(409,'De ploeg heeft deze status al');
        team.responsePhase=cmd.status==='onderweg'||cmd.status==='ter-plaatse'?cmd.status:null;
        team.available=cmd.status!=='pauze';
        team.responseAt=now;
        team.responseBy=actor.uid;
        team.updatedAt=now;
        team.updatedBy=actor.uid;
        for(const incident of Object.values(board.meldingen)){
          if(incident.status!=='actief'||!incident.ploegen.some(ref=>ref.id===team.id))continue;
          if(incident.log.length<TO_BOARD_LIMITS.incidentLog)
            appendLog(incident,actor,now,team.dienst+'-'+team.roepnaam+
              ': status '+labels[previous]+' → '+labels[cmd.status]);
        }
      }else if(cmd.type==='response-phase'){
        // A separate clear action prevents a third accidental click from
        // returning an on-scene crew to "available" during an active incident.
        if(!['onderweg','ter-plaatse',null].includes(cmd.phase))fail(400,'Ongeldige uitrukstatus');
        const team=getTeam(board,cmd.id),previous=team.responsePhase||null;
        if(cmd.phase==='onderweg'&&(previous!==null||team.available===false))
          fail(409,'Alleen een beschikbare ploeg zonder uitrukstatus kan vertrekken');
        if(cmd.phase==='ter-plaatse'&&previous!=='onderweg')
          fail(409,'Een ploeg moet eerst onderweg zijn om ter plaatse te komen');
        if(cmd.phase===null&&previous===null)
          fail(409,'Deze ploeg heeft geen actieve uitrukstatus');
        team.responsePhase=cmd.phase;
        team.responseAt=now;
        team.responseBy=actor.uid;
        team.updatedAt=now;
        team.updatedBy=actor.uid;
        // Mirror the progress in every active assignment for the audit trail,
        // but never prevent a field status update merely because a log is full.
        const description=cmd.phase==='onderweg'?'onderweg':
          cmd.phase==='ter-plaatse'?'ter plaatse':'uitrukstatus gewist';
        for(const incident of Object.values(board.meldingen)){
          if(incident.status!=='actief'||!incident.ploegen.some(ref=>ref.id===team.id))continue;
          if(incident.log.length<TO_BOARD_LIMITS.incidentLog)
            appendLog(incident,actor,now,team.dienst+'-'+team.roepnaam+': '+description);
        }
      }else if(cmd.type==='create-incident'){
        if(Object.keys(board.meldingen).length>=TO_BOARD_LIMITS.incidents)fail(413,'Te veel meldingen in deze dienst. Rond de dienst af.');
        const values=incidentFields(cmd),incidentId=newId();
        if(Object.hasOwn(board.meldingen,incidentId))throw new Error('Dubbele server-ID');
        if(!Number.isSafeInteger(board.nextIncidentNumber+1))fail(413,'Meldingnummerlimiet bereikt');
        board.meldingen[incidentId]={id:incidentId,nr:board.nextIncidentNumber++,...values,status:'actief',ploegen:[],createdAt:now,by:actor.uid,log:[]};
        appendLog(board.meldingen[incidentId],actor,now,'Melding aangemaakt');
      }else if(cmd.type==='update-incident'){
        const incident=getIncident(board,cmd.id),values=incidentFields(cmd);
        appendLog(incident,actor,now,'Gegevens aangepast');
        Object.assign(incident,values,{updatedAt:now});
      }else if(cmd.type==='incident-status'){
        if(!['actief','niet-actief'].includes(cmd.status))fail(400,'Onbekende meldingstatus');
        const incident=getIncident(board,cmd.id);
        if(incident.status!==cmd.status){
          // A final status change remains possible even when the normal log
          // capacity is reached, so a full log cannot prevent archiving.
          if(incident.log.length>=TO_BOARD_LIMITS.incidentLog&&cmd.status==='niet-actief')
            incident.closedAt=now;
          else appendLog(incident,actor,now,'Status gewijzigd naar '+cmd.status);
          incident.status=cmd.status;incident.updatedAt=now;
          if(cmd.status==='niet-actief'){
            incident.closedAt=now;incident.closedBy=actor.uid;
            // Closing the last assignment clears the operational response
            // beacon; other active incidents for that unit keep their state.
            for(const reference of incident.ploegen){
              const team=board.ploegen[reference.id];
              if(!team||!team.responsePhase)continue;
              const stillAssigned=Object.values(board.meldingen).some(item=>
                item.id!==incident.id&&item.status==='actief'&&item.ploegen.some(t=>t.id===team.id));
              if(!stillAssigned){team.responsePhase=null;team.responseAt=now;team.responseBy=actor.uid;}
            }
          }else {delete incident.closedAt;delete incident.closedBy;}
        }
      }else if(cmd.type==='attach-team'){
        const incident=getIncident(board,cmd.id),team=getTeam(board,cmd.teamId);
        if(incident.status!=='actief')fail(409,'Zet de melding eerst actief voordat je een ploeg koppelt');
        if(incident.ploegen.some(reference=>reference.id===team.id))fail(409,'Deze ploeg is al gekoppeld');
        appendLog(incident,actor,now,team.dienst+'-'+team.roepnaam+' gekoppeld');
        incident.ploegen.push({id:team.id,dienst:team.dienst,roep:team.roepnaam});
      }else if(cmd.type==='detach-team'){
        const incident=getIncident(board,cmd.id),teamId=entityId(cmd.teamId),reference=incident.ploegen.find(team=>team.id===teamId);
        if(!reference)fail(409,'Deze ploeg is niet gekoppeld aan de melding');
        appendLog(incident,actor,now,reference.dienst+'-'+reference.roep+' ontkoppeld');
        incident.ploegen=incident.ploegen.filter(team=>team.id!==teamId);
        const team=board.ploegen[teamId];
        if(team?.responsePhase&&!Object.values(board.meldingen).some(item=>
          item.status==='actief'&&item.ploegen.some(ref=>ref.id===teamId))){
          team.responsePhase=null;team.responseAt=now;team.responseBy=actor.uid;
        }
      }else if(cmd.type==='close-session'){
        if(Object.values(board.meldingen).some(incident=>incident.status==='actief'))fail(409,'Rond eerst alle actieve meldingen af voordat je de dienst afsluit');
        const archive={id:board.session.id,dept:'politie',session:structuredClone(board.session),ploegen:structuredClone(board.ploegen),meldingen:structuredClone(board.meldingen),closedAt:now,closedBy:actor.uid};
        capacity(board);
        // Closing adds provenance fields. Reserve overhead above the live-board
        // budget so a valid full board can always be archived without data loss.
        if(Buffer.byteLength(JSON.stringify(archive),'utf8')>TO_BOARD_LIMITS.archiveBytes)fail(413,'Het dienstarchief is te groot');
        return {board:{...emptyBoard(),revision:source.revision+1},archive};
      }
    }
  }
  board.revision=source.revision+1;
  capacity(board);
  return {board,archive:null};
}
