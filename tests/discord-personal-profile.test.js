import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalProfileView} from '../src/discord-personal-profile.js';
const id='505659510359064606',another='222222222222222222';
const member={roleIds:['1335578488664490057','1309532438082355251']};
test('Own profile never includes another Discord member or their qualifications',()=>{
 const people=[
   {personId:id,dept:'politie',name:'Eigen naam',call:'930',rank:'INP',
     specialties:[{label:'Motor',value:'Ja'},{label:'K9',value:'Nee'}]},
   {personId:another,dept:'politie',name:'Vreemde naam',call:'333',rank:'CP',
     specialties:[{label:'SIV',value:'Ja'}]}
 ];
 const training=[
   {subjectDiscordId:id,department:'politie',courseName:'Motoropleiding',
     eventDate:'2026-10-01',result:'geslaagd'},
   {subjectDiscordId:another,department:'politie',courseName:'Vreemde opleiding',
     eventDate:'2026-10-02',result:'geslaagd'},
   {subjectDiscordId:id,department:'politie',courseName:'Verwijderde cursus',
     eventDate:'2026-10-03',result:'geslaagd',status:'verwijderd'}
 ];
 const out=personalProfileView(id,member,people,training);
 assert.equal(out.discordId,id);
 assert.equal(out.staff.length,1);
 assert.deepEqual(out.staff[0].specializations,[{name:'Motor',status:'Ja'}]);
 assert.deepEqual(out.training.map(x=>x.name),['Motoropleiding']);
 assert.ok(out.roles.some(r=>r.name==='Bestuur'));
 assert.equal(JSON.stringify(out).includes('Vreemde'),false);
});
test('Read-only own Discord profile fetch derives identity from authenticated token',()=>{
 const route=readFileSync(new URL('../src/discord-personal-profile.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 assert.ok(route.includes("app.get('/api/discord/personal-profile',async(req,res)=>"));
 assert.ok(route.includes("getAuth().verifyIdToken(match[1])"));
 assert.ok(route.includes("verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID)!==id"));
 assert.ok(route.includes("doc(dept+'_'+id).collection('records')"));
 assert.ok(route.includes("p?.personId===id"));
 assert.ok(server.includes('installDiscordPersonalProfileRoutes(app,{getSnapshot})'));
 assert.ok(ui.includes('id="personalTab"'));
 assert.ok(ui.includes('id="personalRoles"'));
 assert.ok(ui.includes('id="personalSpecializations"'));
 assert.ok(ui.includes('id="personalTraining"'));
 assert.ok(ui.includes('id="personalReload"'));
 assert.equal(route.includes('req.params.discordId'),false);
});
