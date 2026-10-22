import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {botRefreshAllowed,verifiedBotMember,botRefreshTooSoon,discordBotToken} from '../src/discord-bot-refresh.js';
const id='505659510359064606',guild='123456789012345678',now=Date.UTC(2026,9,22);
const token={uid:'discord:'+id,bpdDiscord:true,bpdGuildId:guild,
  firebase:{sign_in_provider:'custom'}};
const proof={guildId:guild,verifiedAt:now-900000,roleIds:['999999999999999999']};
test('Bot refresh authorises only a prior proven Discord user in its own guild',()=>{
 assert.equal(botRefreshAllowed(token,proof,guild),true);
 assert.equal(botRefreshAllowed({...token,uid:'discord:111111111111111111'},proof,guild),true,
   'Identity is always taken from the token; route must not accept a client-supplied member ID');
 assert.equal(botRefreshAllowed({...token,bpdDiscord:false},proof,guild),false);
 assert.equal(botRefreshAllowed({...token,bpdGuildId:'222222222222222222'},proof,guild),false);
 assert.equal(botRefreshAllowed({...token,firebase:{sign_in_provider:'google.com'}},proof,guild),false);
 assert.equal(botRefreshAllowed(token,{...proof,roleIds:['bad']},guild),false);
 assert.equal(botRefreshAllowed(token,{...proof,guildId:'222222222222222222'},guild),false);
 assert.equal(botRefreshAllowed(token,null,guild),false);
});
test('Bot refresh validates Discord API membership before storing any role snapshot',()=>{
 assert.deepEqual(verifiedBotMember({roles:['999999999999999999','999999999999999999'],
   joined_at:'2024-05-10T10:00:00.000Z',user:{id}},id),
   {roleIds:['999999999999999999'],joinedAt:'2024-05-10T10:00:00.000Z'});
 assert.equal(verifiedBotMember({roles:['bad'],joined_at:'2024-05-10T10:00:00Z'},id),null);
 assert.equal(verifiedBotMember({roles:[],joined_at:'bad'},id),null);
 assert.equal(verifiedBotMember({roles:[],joined_at:'2024-05-10T10:00:00Z',user:{id:'222222222222222222'}},id),null);
});
test('Manual refresh uses a configured secret, cooldown and never changes Discord permissions',()=>{
 assert.equal(discordBotToken({DISCORD_BOT_TOKEN:'x'.repeat(40)}),'x'.repeat(40));
 assert.equal(discordBotToken({DISCORD_BOT_TOKEN:'YOUR_TOKEN_HERE'}),null);
 assert.equal(discordBotToken({}),null);
 assert.equal(botRefreshTooSoon({botRefreshedAt:now-59000},now),true);
 assert.equal(botRefreshTooSoon({botRefreshedAt:now-61000},now),false);
 const route=readFileSync(new URL('../src/discord-oauth.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 const status=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 assert.ok(route.includes("app.post('/api/discord/refresh',async(req,res)=>"));
 assert.ok(route.includes("decoded=await appAuth().verifyIdToken(bearer)"));
 assert.ok(route.includes("snapshot=await getFirestore().collection('bpd_discord_auth').doc(id).get()"));
 assert.ok(route.includes('verifiedBotMember(data,id)'));
 assert.ok(route.includes("collection('bpd_discord_refresh_audit')"));
 assert.ok(route.includes("changesToDiscord:false,permissionsGranted:false"));
 assert.ok(ui.includes('id="boardBotRefresh"'));
 assert.ok(ui.includes("api('/api/discord/refresh',{method:'POST'})"));
 assert.ok(status.includes('id="botRefresh"'));
});
