import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ageStatus,diagnosticState,diagnosisAccess,collectDiscordDiagnosis
} from '../src/discord-role-diagnostics.js';
import {
  discordDiagnosticsTestOnly,installDiscordDiagnosticRoutes
} from '../src/discord-role-diagnostics-routes.js';
import {verifyBoardDiscordRole} from '../src/dossier-grants.js';
import {activeBoardAppointment} from '../src/board-appointment-policy.js';

const guild='123456789012345678';
const id='222222222222222222';
const token='TOKEN_CONFIDENTIAL_DO_NOT_EXPOSE_123456';
const at=Date.now();
const boardId='1309532438082355251';
const member=(roles=[boardId])=>({
 guildId:guild,roleIds:roles,verifiedAt:at-5000
});
const env={
 RENDER_SERVICE_ID:'srv-dbampoqjnfac738b1tsg',
 DISCORD_GUILD_ID:guild,BPD_DISCORD_BOT_TOKEN:token,
 DISCORD_CLIENT_ID:'333333333333333333',
 DISCORD_CLIENT_SECRET:'EXAMPLE_SECRET_UNSHARED',
 DISCORD_REDIRECT_URI:'https://test.example/auth/discord/callback'
};
const actor={uid:'discord:'+id,discordId:id,role:'basiskader'};
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{'content-type':'application/json'}
});
const dbFor=(identity,appointment)=>({
 collection:which=>({doc:key=>({
  get:async()=>{
   assert.equal(key,id);
   return which==='bpd_discord_auth'?
     {exists:!!identity,data:()=>identity}:
     {exists:!!appointment,data:()=>appointment};
  }
 })})
});
const appAndResponse=({firestore,collect,config=env,clock=()=>at})=>{
 const handlers=new Map();
 const app={get:(path,...middleware)=>handlers.set(path,middleware)};
 installDiscordDiagnosticRoutes(app,{
   requireUser:(_req,_res,next)=>next(),
   firestore,collect,env:config,now:clock
 });
 const res={
   statusCode:200,headers:{},body:null,
   set(name,val){this.headers[name]=val;return this},
   status(code){this.statusCode=code;return this},
   json(data){this.body=data;return this}
 };
 return {handler:handlers.get('/api/board/discord-diagnostics').at(-1),res};
};

test('Board access is independent of police cadre, validates own Discord identity',()=>{
 const verified=member();
 assert.equal(diagnosisAccess(actor,verified,null,guild,verifyBoardDiscordRole,
   activeBoardAppointment),'geverifieerde_bestuursrol');
 assert.equal(diagnosisAccess(actor,member([]),null,guild,verifyBoardDiscordRole,
   activeBoardAppointment),null);
 assert.equal(diagnosisAccess(actor,member([]),{
   status:'approved',permissions:[]},guild,verifyBoardDiscordRole,
   activeBoardAppointment),'goedgekeurde_bestuursaanstelling');
 assert.equal(diagnosisAccess({...actor,uid:'google:admin'},verified,null,guild,
   verifyBoardDiscordRole,activeBoardAppointment),null);
 assert.equal(diagnosisAccess({...actor,discordId:'unexpected'},verified,null,guild,
   verifyBoardDiscordRole,activeBoardAppointment),null);
 assert.equal(diagnosisAccess(actor,{...verified,verifiedAt:at-16*60000},null,guild,
   (m,g)=>verifyBoardDiscordRole(m,g,at),activeBoardAppointment),null);
});

test('Only the Render TEST service exposes the diagnostic endpoint',()=>{
 assert.equal(discordDiagnosticsTestOnly(env),true);
 assert.equal(discordDiagnosticsTestOnly({RENDER_GIT_BRANCH:'main',
   RENDER_SERVICE_ID:'srv-other'}),false);
 assert.equal(discordDiagnosticsTestOnly({RENDER_GIT_BRANCH:'feature/verlofmodule-test',
   RENDER_SERVICE_NAME:'belgiepd-beheerportaal-TESTSERVER'}),true);
});

test('Discord diagnostics probe only fixed read endpoints, never leak token or IDs',async()=>{
 const visited=[];
 const fetchImpl=async(url,options)=>{
   visited.push([url,options]);
   assert.equal(options.headers.Authorization,'Bot '+token);
   assert.equal(options.method,'GET');
   if(url.endsWith('/users/@me'))return response({id:'123456789012345678',bot:true});
   if(url.endsWith('/roles'))return response([
     {id:'1380843428354592780',name:'Recherche'},
     {id:boardId,name:'Bestuur'}]);
   if(url.includes('/members?limit=1'))return response([
     {user:{id},roles:[boardId]}]);
   if(url.endsWith('/members/'+id))return response({user:{id},roles:[boardId]});
   throw Error('Unexpected URL');
 };
 const answer=await collectDiscordDiagnosis({
   env,ownId:id,ownMember:member(),
   accessSource:'geverifieerde_bestuursrol',fetchImpl,at
 });
 assert.equal(answer.environment,'TEST');
 assert.equal(answer.mode,'alleen-lezen');
 assert.equal(answer.probes.botIdentity.status,'ok');
 assert.equal(answer.probes.guildRoles.rechercheRole,'present');
 assert.equal(answer.probes.guildRoles.catalogRecognized>=2,true);
 assert.equal(answer.probes.memberListing.status,'ok');
 assert.equal(answer.probes.memberListing.completeCoverageVerified,false);
 assert.equal(answer.probes.ownMember.roleAgreement,'match');
 assert.equal(visited.length,4);
 const serialized=JSON.stringify(answer);
 assert.equal(serialized.includes(token),false);
 assert.equal(serialized.includes(id),false);
 assert.equal(serialized.includes(guild),false);
 assert.equal(serialized.includes('TOKEN_CONFIDENTIAL'),false);
});

test('Discord 403 is a warning, not a false successful member census',async()=>{
 const fetchImpl=async url=>url.includes('/members?limit=1')?
   response({message:'Missing Access'},403):response({message:'Unexpected'},429);
 const data=await collectDiscordDiagnosis({env,ownId:id,ownMember:member(),
   fetchImpl,at});
 assert.equal(data.probes.memberListing.status,'forbidden');
 assert.equal(data.probes.memberListing.completeCoverageVerified,false);
 assert.equal(data.probes.guildRoles.status,'rate_limited');
 assert.ok(data.notes.some(s=>s.includes('Server Members Intent')));
 assert.equal(diagnosticState(401),'unauthorized');
 assert.equal(diagnosticState(403),'forbidden');
 assert.equal(diagnosticState(429),'rate_limited');
});

test('Without bot secrets no Discord requests are initiated',async()=>{
 const answer=await collectDiscordDiagnosis({
   env:{DISCORD_GUILD_ID:guild},ownId:id,ownMember:member(),at,
   fetchImpl:async()=>{throw Error('Must not call Discord')}
 });
 assert.equal(answer.probes.botIdentity.status,'not_configured');
 assert.equal(answer.configuration.botConfigured,false);
 assert.equal(ageStatus(member(),guild,at).status,'fresh');
});

test('Only board-scoped bearer identity can call the API; reads cached per user',async()=>{
 let calls=0;
 const collect=async()=>{calls++;return {environment:'TEST',mode:'alleen-lezen'}};
 const {handler,res}=appAndResponse({
   firestore:()=>dbFor(member(),null),collect
 });
 await handler({bpd:actor},res);
 assert.equal(res.statusCode,200);
 assert.equal(calls,1);
 await handler({bpd:actor},res);
 assert.equal(calls,1,'Second request uses 45s sanitized cache');
 const blocked=appAndResponse({firestore:()=>dbFor(member([]),null),collect});
 await blocked.handler({bpd:actor},blocked.res);
 assert.equal(blocked.res.statusCode,403);
 assert.equal(calls,1,'No Discord probe for non-board roles');
 const otherLogin=appAndResponse({firestore:()=>dbFor(member(),null),collect});
 await otherLogin.handler({bpd:{...actor,uid:'google:'+id}},otherLogin.res);
 assert.equal(otherLogin.res.statusCode,403);
 assert.equal(calls,1);
 const main=appAndResponse({firestore:()=>dbFor(member(),null),collect,
   config:{RENDER_SERVICE_ID:'srv-other',RENDER_GIT_BRANCH:'main'}});
 await main.handler({bpd:actor},main.res);
 assert.equal(main.res.statusCode,404);
 assert.equal(calls,1);
 const appointed=appAndResponse({firestore:()=>dbFor(member([]),
   {status:'approved',permissions:[]}),collect});
 await appointed.handler({bpd:actor},appointed.res);
 assert.equal(appointed.res.statusCode,200);
 assert.equal(calls,2);
});

test('Board link is hidden until independent board evidence is present',()=>{
 const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/discord-diagnose.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(html,/id="discordDiagnosticsLaunch" hidden/);
 assert.match(html,/verified\|\|entry\?\.status==='approved'/);
 assert.match(page,/getIdToken\(\)/);
 assert.match(page,/\/api\/board\/discord-diagnostics/);
 assert.match(server,/installDiscordDiagnosticRoutes\(app,\{requireUser\}\)/);
});
