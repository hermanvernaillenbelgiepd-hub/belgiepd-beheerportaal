import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ageStatus,diagnosticState,diagnosisAccess,collectDiscordDiagnosis,
  collectDiscordCoverage
} from '../src/discord-role-diagnostics.js';
import {
  discordDiagnosticsMainOnly,discordDiagnosticsPageAllowed,installDiscordDiagnosticRoutes
} from '../src/discord-role-diagnostics-routes.js';
import {makeProfileCookie} from '../src/portal-profile-mode.js';

const guild='123456789012345678';
const id='222222222222222222';
const token='TOKEN_CONFIDENTIAL_DO_NOT_EXPOSE_123456';
const at=Date.now();
const boardId='1309532438082355251';
const member=(roles=[boardId])=>({
 guildId:guild,roleIds:roles,verifiedAt:at-5000
});
const env={
 RENDER_SERVICE_ID:'srv-dbaj7njbc2fs73bjt4fg',
 DISCORD_GUILD_ID:guild,BPD_DISCORD_BOT_TOKEN:token,
 DISCORD_CLIENT_ID:'333333333333333333',
 DISCORD_CLIENT_SECRET:'EXAMPLE_SECRET_UNSHARED',
 DISCORD_REDIRECT_URI:'https://test.example/auth/discord/callback'
};
const actor={uid:'discord:'+id,discordId:id,role:'basiskader'};
const technical={...actor,role:'beheerder',portalTechnicalMode:true,
  profileTechnicalAvailable:true};
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
 return {handler:handlers.get('/api/board/discord-diagnostics').at(-1),
  accessHandler:handlers.get('/api/board/discord-diagnostics/access').at(-1),res};
};

test('Alleen aangemelde Technisch Beheer-modus mag diagnosegegevens zien',()=>{
 assert.equal(diagnosisAccess(technical),'geverifieerd_technisch_beheer');
 for(const blocked of [
  actor,{...actor,role:'officierenkader',departments:['politie']},
  {...actor,role:'korpsleiding',departments:['politie']},
  {...actor,role:'bestuur',boardPersonnelAdmin:true},
  {...actor,role:'beheerder',profileTechnicalAvailable:true},
  {...actor,role:'beheerder',portalTechnicalMode:true},
  {...technical,uid:'google:'+id},
  {...technical,discordId:'234567890123456789'},
  {...technical,role:'officierenkader'}
 ])assert.equal(diagnosisAccess(blocked),null);
});
test('Rechtstreekse diagnosepagina vereist geldige ondertekende technische cookie en allowlist',()=>{
 const pageEnv={...env,BPD_TECHNICAL_ADMIN_DISCORD_IDS:id,
   BPD_PORTAL_PROFILE_SIGNING_KEY:'S'.repeat(48)};
 const cookie=makeProfileCookie(actor.uid,id,pageEnv.BPD_PORTAL_PROFILE_SIGNING_KEY,at)
   .split(';')[0];
 assert.equal(discordDiagnosticsPageAllowed(cookie,pageEnv,at),true);
 assert.equal(discordDiagnosticsPageAllowed('',pageEnv,at),false);
 assert.equal(discordDiagnosticsPageAllowed(cookie,{...pageEnv,
   BPD_TECHNICAL_ADMIN_DISCORD_IDS:'333333333333333333'},at),false);
 assert.equal(discordDiagnosticsPageAllowed(cookie,{...pageEnv,
   RENDER_SERVICE_ID:'srv-dbampoqjnfac738b1tsg'},at),false);
 assert.equal(discordDiagnosticsPageAllowed(cookie,pageEnv,at+9*3600*1000),false);
 assert.equal(discordDiagnosticsPageAllowed(cookie.replace(/.$/,'x'),pageEnv,at),false);
 assert.equal(discordDiagnosticsPageAllowed('bpd_portal_profile=invalid',pageEnv,at),false);
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.ok(server.indexOf("app.get('/discord-diagnose.html'")>=0);
 assert.ok(server.indexOf("app.get('/discord-diagnose.html'")<
   server.indexOf("app.use(express.static"));
 assert.match(server,/discordDiagnosticsPageAllowed\(req\.headers\.cookie,process\.env\)/);
});

test('Only the canonical Render MAIN service exposes the diagnostic endpoint',()=>{
 assert.equal(discordDiagnosticsMainOnly(env),true);
 assert.equal(discordDiagnosticsMainOnly({RENDER_GIT_BRANCH:'feature/verlofmodule-test',
   RENDER_SERVICE_ID:'srv-dbampoqjnfac738b1tsg',
   RENDER_SERVICE_NAME:'belgiepd-beheerportaal-TESTSERVER'}),false);
 assert.equal(discordDiagnosticsMainOnly({RENDER_GIT_BRANCH:'main',
   RENDER_SERVICE_NAME:'belgiepd-beheerportaal'}),true);
 assert.equal(discordDiagnosticsMainOnly({RENDER_SERVICE_ID:'srv-other'}),false);
 assert.equal(discordDiagnosticsMainOnly({RENDER_SERVICE_ID:'srv-other',
   RENDER_GIT_BRANCH:'main',RENDER_SERVICE_NAME:'belgiepd-beheerportaal'}),false,
   'A different service identity must not be rescued by a main branch name');
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
 assert.equal(answer.environment,'MAIN');
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

test('API weigert Bestuur en kader, cache en botcalls alleen in technische modus',async()=>{
 let calls=0;
 const collect=async()=>{calls++;return {environment:'MAIN',mode:'alleen-lezen'}};
 const {handler,res}=appAndResponse({
  firestore:()=>dbFor(member([]),null),collect
 });
 await handler({bpd:technical},res);
 assert.equal(res.statusCode,200);
 assert.equal(calls,1);
 await handler({bpd:technical},res);
 assert.equal(calls,1,'Herhaald technisch verzoek gebruikt beperkte cache');
 for(const blocked of [
  actor,{...actor,role:'officierenkader',departments:['politie']},
  {...actor,role:'korpsleiding',departments:['politie']},
  {...actor,role:'bestuur'},
  {...technical,portalTechnicalMode:false},
  {...technical,uid:'google:'+id}
 ]){
  const result=appAndResponse({firestore:()=>{throw Error('No database read allowed')},collect});
  await result.handler({bpd:blocked},result.res);
  assert.equal(result.res.statusCode,403);
  assert.equal(calls,1);
 }
 const otherService=appAndResponse({firestore:()=>dbFor(member([]),null),collect,
  config:{RENDER_SERVICE_ID:'srv-other',RENDER_GIT_BRANCH:'main'}});
 await otherService.handler({bpd:technical},otherService.res);
 assert.equal(otherService.res.statusCode,404);
 assert.equal(calls,1);
});

test('Technische diagnoselink blijft verborgen zonder positieve API-toestemming',()=>{
 const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/discord-diagnose.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(html,/id="discordDiagnosticsLaunch" hidden/);
 assert.match(html,/\/api\/board\/discord-diagnostics\/access/);
 assert.match(html,/loadDiscordDiagnosticsLink\(\)/);
 assert.match(html,/Uitsluitend geverifieerd Technisch Beheer/);
 assert.match(page,/UITSLUITEND TECHNISCH BEHEER/);
 assert.match(page,/getIdToken\(\)/);
 assert.match(page,/\/api\/board\/discord-diagnostics/);
 assert.match(server,/installDiscordDiagnosticRoutes\(app,\{requireUser\}\)/);
});
test('De toegangscheck raadpleegt Discord niet en weigert alle niet-technische rollen',async()=>{
 let calls=0;
 const collect=async()=>{calls++;return {}};
 for(const denied of [
  actor,{...actor,role:'officierenkader',departments:['politie']},
  {...actor,role:'korpsleiding',departments:['politie']},
  {...actor,role:'bestuur'}
 ]){
  const result=appAndResponse({firestore:()=>{throw Error('No reads')},collect});
  await result.accessHandler({bpd:denied},result.res);
  assert.deepEqual(result.res.body,{allowed:false});
  assert.equal(calls,0);
 }
 const approved=appAndResponse({firestore:()=>{throw Error('No reads')},collect});
 await approved.accessHandler({bpd:technical},approved.res);
 assert.deepEqual(approved.res.body,{allowed:true});
 assert.equal(calls,0);
 const diagnosis=appAndResponse({firestore:()=>dbFor(member([]),null),collect});
 await diagnosis.handler({bpd:technical},diagnosis.res);
 assert.equal(diagnosis.res.statusCode,200);
 assert.equal(calls,1);
});

test('Explicit complete Discord member scan follows after cursor and reveals only totals',async()=>{
 const all=Array.from({length:1002},(_,i)=>({
   user:{id:String(100000000000000000n+BigInt(i))},
   roles:i===5||i===1000?['1380843428354592780']:[]
 }));
 let requests=[];
 const api=async(url,options)=>{
   requests.push(url);
   assert.equal(options.method,'GET');
   assert.equal(options.headers.Authorization,'Bot '+token);
   assert.equal(options.redirect,'error');
   return response(requests.length===1?all.slice(0,1000):all.slice(1000));
 };
 const full=await collectDiscordCoverage({env,fetchImpl:api});
 assert.deepEqual(full,{status:'ok',membersCount:1002,rechercheMembers:2,
   pages:2,completeCoverageVerified:true});
 assert.match(requests[0],/members\?limit=1000$/);
 assert.match(requests[1],/after=100000000000000999$/);
 const payload=JSON.stringify(full);
 assert.equal(payload.includes(id),false);
 assert.equal(payload.includes(guild),false);
 assert.equal(payload.includes(token),false);
 assert.equal(payload.includes(all[1000].user.id),false);
});

test('Bounded member census does not claim all members when scan limit reached',async()=>{
 let calls=0;
 const full=await collectDiscordCoverage({env,fetchImpl:async()=>{
   const start=100000000000000000n+BigInt(calls++)*1000n;
   return response(Array.from({length:1000},(_,i)=>({
     user:{id:String(start+BigInt(i))},roles:[]
   })));
 }});
 assert.equal(full.status,'partial');
 assert.equal(full.completeCoverageVerified,false);
 assert.equal(full.membersCount,3000);
 assert.equal(calls,3,'More than 3 requests would over-scan Discord');
});

test('403 and invalid paged member list fail closed without leaking partial census',async()=>{
 const forbidden=await collectDiscordCoverage({
   env,fetchImpl:async()=>response({message:'Missing Access'},403)
 });
 assert.equal(forbidden.status,'forbidden');
 assert.equal(forbidden.membersCount,null);
 const malformed=await collectDiscordCoverage({
   env,fetchImpl:async()=>response([{user:{id:'not-a-discord-id'},roles:[]}])
 });
 assert.equal(malformed.status,'invalid_response');
 assert.equal(malformed.completeCoverageVerified,false);
 const invalidRole=await collectDiscordCoverage({
   env,fetchImpl:async()=>response([{user:{id},roles:['invalid-role']}])
 });
 assert.equal(invalidRole.status,'invalid_response');
});

test('Volledige ledenlijstcontrole vraagt technische modus en is per gebruiker gecachet',async()=>{
 let scans=0;
 const collect=async({coverage})=>{
  if(coverage)scans++;
  return {environment:'MAIN',mode:'alleen-lezen',
    probes:{fullCoverage:{status:coverage?'ok':'not_run'}}};
 };
 const {handler,res}=appAndResponse({
  firestore:()=>dbFor(member([]),null),collect
 });
 await handler({bpd:technical,query:{}},res);
 assert.equal(scans,0);
 await handler({bpd:technical,query:{coverage:'1'}},res);
 assert.equal(scans,1);
 await handler({bpd:technical,query:{coverage:'1'}},res);
 assert.equal(scans,1,'Een dubbele controle leest Discord niet opnieuw');
 const unauthorized=appAndResponse({
  firestore:()=>{throw Error('No reads')},collect
 });
 await unauthorized.handler({bpd:actor,query:{coverage:'1'}},unauthorized.res);
 assert.equal(unauthorized.res.statusCode,403);
 assert.equal(scans,1);
});

test('Board MAIN page offers explicit scan and never renders identities',()=>{
 const html=readFileSync(new URL('../public/discord-diagnose.html',import.meta.url),'utf8');
 assert.match(html,/id="coverageRefresh"/);
 assert.match(html,/\\?coverage=1/);
 assert.match(html,/full\.completeCoverageVerified===true/);
 assert.doesNotMatch(html,/data\.probes\.fullCoverage\.memberIds/);
});
