import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { validReturnTo,discordConfig } from '../src/discord-utils.js';

const pages=['index','discord-status','registraties','roepnummers','rollen-opleidingen','verlofbeheer','weekrapporten','gebruikersbeheer','personeelsbeheer','personeel-koppelen'];
test('All browser module scripts parse as valid JavaScript',()=>{
  for(const name of pages){
    const html=readFileSync(new URL('../public/'+name+'.html',import.meta.url),'utf8');
    const scripts=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length>0,name+' must contain a module');
    for(const [i,script] of scripts.entries()){
      assert.doesNotThrow(()=>new Script(script[1],{filename:name+'#'+i}),name+' has invalid JS');
    }
  }
  const common=readFileSync(new URL('../public/portal-login.js',import.meta.url),'utf8');
  assert.doesNotThrow(()=>new Script(common.replace(/^export\s+/gm,'')));
});
test('Personnel intake warns about duplicate callsigns and Discord claims',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  assert.match(html,/id="newDuplicateWarning"/);
  assert.match(html,/id="pendingSummary"/);
  assert.match(html,/Kopieer uitnodiging/);
  assert.ok(html.includes("window.location.origin+'/personeel-koppelen.html"));
  const from=html.indexOf('function newPersonnelConflicts(person){');
  const to=html.indexOf('function newFormData(){',from);
  assert.ok(from>0&&to>from);
  const check=new Function('people','pendingPeople','person',
    html.slice(from,to)+';return newPersonnelConflicts(person)');
  const existing=[{dept:'politie',discordId:'111111111111111111',name:'Bestaand',call:'S250'}];
  const pending=[{dept:'politie',name:'In afwachting',call:'S251',
    request:{discordId:'222222222222222222'}}];
  const input={dept:'politie',discordId:'',call:'s250'};
  assert.match(check(existing,pending,input),/Roepnummer/);
  assert.match(check(existing,pending,{...input,call:'S251'}),/Roepnummer/);
  assert.match(check(existing,pending,{...input,call:'S252',discordId:'111111111111111111'}),/Discord-ID/);
  assert.match(check(existing,pending,{...input,call:'S252',discordId:'222222222222222222'}),/Discord-ID/);
  assert.equal(check(existing,pending,{...input,call:'S252'}),'');
  assert.equal(check(existing,pending,{...input,dept:'brandweer'}),'');
});
test('OAuth return-to paths are explicitly allowlisted; never external domains',()=>{
  assert.equal(validReturnTo('/verlofbeheer.html'),'/verlofbeheer.html');
  assert.equal(validReturnTo('/rollen-opleidingen.html'),'/rollen-opleidingen.html');
  assert.equal(validReturnTo('/gebruikersbeheer.html'),'/gebruikersbeheer.html');
  assert.equal(validReturnTo('/personeelsbeheer.html'),'/personeelsbeheer.html');
  assert.equal(validReturnTo('/personeel-koppelen.html'),'/personeel-koppelen.html');
  assert.equal(validReturnTo('/'),'/');
  assert.equal(validReturnTo('https://evil.example/'),'/discord-status.html');
  assert.equal(validReturnTo('//evil.example/'),'/discord-status.html');
});
test('Discord callback needs a production-safe redirect',()=>{
  const cfg={DISCORD_CLIENT_ID:'111111111111111111',DISCORD_CLIENT_SECRET:'some-valid-discord-secret',
    DISCORD_GUILD_ID:'222222222222222222',DISCORD_REDIRECT_URI:'https://belgiepd-beheerportaal.onrender.com/auth/discord/callback'};
  assert.equal(discordConfig(cfg).ready,true);
  assert.equal(discordConfig({...cfg,DISCORD_REDIRECT_URI:'https://evil.example/callback'}).ready,false);
  assert.equal(discordConfig({...cfg,DISCORD_CLIENT_SECRET:'PLACEHOLDER_SECRET'}).ready,false);
});
