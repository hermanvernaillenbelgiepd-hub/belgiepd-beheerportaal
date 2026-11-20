import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discordBotToken} from '../src/discord-bot-refresh.js';
import {verifiedPoliceRank} from '../src/portal-profile-mode.js';
import {canChangePoliceGrade} from '../src/personnel-rank-policy.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const guild='123456789012345678',user='111111111111111111';
const subject={dept:'politie',personId:'222222222222222222',
 call:'485',rank:'Inspecteur van Politie (INP)'};
const officer={uid:'discord:'+user,discordId:user,
 role:'officierenkader',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},
 dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie']};

test('missing MAIN bot secret is a distinct configuration problem, not an absent cadre',()=>{
 assert.equal(discordBotToken({}),null);
 assert.equal(discordBotToken({BPD_DISCORD_BOT_TOKEN:'YOUR_TOKEN_HERE'}),null);
 const server=read('src/server.js');
 assert.match(server,/const botConfigured=Boolean\(discordBotToken\(process\.env\)\)/);
 assert.match(server,/bot-token ontbreekt of ongeldig/);
 const route=read('src/personnel-editor-routes.js');
 assert.match(route,/const botMissing=unavailable&&!discordBotToken\(process\.env\)/);
 assert.match(route,/MAIN: Discord-bot-token ontbreekt of is ongeldig in Render/);
 assert.match(route,/Er is niets opgeslagen/);
 assert.match(route,/BPD_DISCORD_BOT_TOKEN/);
 assert.doesNotMatch(route,/console\.(?:log|info|warn)\([^\n]*BPD_DISCORD_BOT_TOKEN/);
});
test('fresh guild-bound OAuth role proves actual Officer cadre even when bot is not configured',()=>{
 const now=Date.UTC(2026,10,20,0,0);
 const member={guildId:guild,verifiedAt:now-120000,
  roleIds:['1309532438053130326','1473474238664020151']};
 const rank=verifiedPoliceRank(member,guild,now);
 assert.equal(rank,'officierenkader');
 assert.equal(canChangePoliceGrade({...officer,discordPoliceRank:rank},subject),true);
 const expired=verifiedPoliceRank({...member,verifiedAt:now-20*60000},guild,now);
 assert.equal(expired,null);
 assert.equal(canChangePoliceGrade({...officer,discordPoliceRank:expired},subject),false);
 const unrelated=verifiedPoliceRank({...member,roleIds:['1309532438053130326']},
  guild,now);
 assert.equal(unrelated,null);
 assert.equal(canChangePoliceGrade({...officer,discordPoliceRank:unrelated},subject),false);
});
test('personnel form offers secure OAuth re-verification without storing secrets',()=>{
 const page=read('public/personeelsbeheer.html');
 assert.match(page,/e\.message\.includes\('Discord-bot-token ontbreekt'\)/);
 assert.match(page,/link\.href='\/auth\/discord\/start\?return=%2Fpersoneelsbeheer\.html'/);
 assert.match(page,/Bewaar je motivering voordat je opnieuw aanmeldt/);
 const oauth=read('src/discord-oauth.js');
 assert.match(oauth,/u\.searchParams\.set\('scope','identify guilds\.members\.read'\)/);
 assert.match(oauth,/const member=await discordJson\('https:\/\/discord\.com\/api\/v10\/users\/@me\/guilds\/\+'/);
 assert.match(oauth,/verifiedAt:now/);
 const gateway=read('src/server.js');
 assert.match(gateway,/actor\.discordPoliceRank=verifiedPoliceRank\(discordMember,process\.env\.DISCORD_GUILD_ID\)/);
 assert.match(gateway,/else if\(guild\.status==='not_member'\)\{/);
});
