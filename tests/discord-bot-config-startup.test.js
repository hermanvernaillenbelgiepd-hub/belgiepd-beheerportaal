import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discordBotToken} from '../src/discord-bot-refresh.js';

test('MAIN startup reports only safe Discord bot configuration labels',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/const botConfigured=Boolean\(discordBotToken\(process\.env\)\)/);
 assert.match(server,/Discord-botconfiguratie:/);
 assert.match(server,/bot-token ontbreekt of ongeldig/);
 assert.doesNotMatch(server,/console\.(?:log|info|warn)\([^\n]*process\.env\.(?:BPD_DISCORD_BOT_TOKEN|DISCORD_BOT_TOKEN)/);
 assert.equal(discordBotToken({}),null);
 assert.equal(discordBotToken({BPD_DISCORD_BOT_TOKEN:'YOUR_TOKEN_HERE'}),null);
 assert.ok(discordBotToken({BPD_DISCORD_BOT_TOKEN:'x'.repeat(40)}));
});
