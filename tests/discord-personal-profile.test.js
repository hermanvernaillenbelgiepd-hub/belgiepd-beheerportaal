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
 assert.ok(ui.includes('class="identity-grid"'));
 assert.ok(ui.includes('id="joined"'));
 assert.ok(ui.includes('id="verified"'));
 assert.ok(ui.includes('id="name"'));
 assert.ok(ui.includes('id="discordId"'));
 assert.ok(ui.includes('<details class="role-details">'));
 assert.ok(ui.includes('id="botRefresh"'));
 assert.ok(ui.includes("await Promise.all([loadPersonal(),loadLeave()])"));
 assert.equal(ui.includes('id="discordTab"'),false);
 assert.equal(ui.includes('id="personalTab"'),false);
 assert.ok(ui.includes('id="personalRoles"'));
 assert.ok(ui.includes('id="personalSpecializations"'));
 assert.ok(ui.includes('id="personalTraining"'));
 assert.ok(ui.includes('id="personalReload"'));
 assert.equal(route.includes('req.params.discordId'),false);
});

test('Discord profile is presented on one screen, without duplicate tab content',()=>{
 const ui=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 const items=['id="profile"','id="name"','id="discordId"','id="joined"','id="verified"',
  'id="personalRoles"','id="personalSpecializations"','id="personalTraining"','id="personalReload"','id="botRefresh"','id="roles"'];
 for(const marker of items)assert.equal(ui.split(marker).length-1,1,marker);
 assert.ok(ui.includes('<summary>Geavanceerd · alle Discord-rol-ID'));
 assert.equal(ui.includes('role="tab"'),false);
 assert.equal(ui.includes('role="tabpanel"'),false);
});

test('My Discord reuses central leave APIs and never shows another user’s review queue',()=>{
 const ui=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
 for(const s of ['id="myLeave"','id="leaveStart"','id="leaveEnd"','id="leaveNote"',
   'id="leaveForm"','id="leaveRequests"','href="/verlofbeheer.html"'])assert.ok(ui.includes(s),s);
 assert.ok(ui.includes("leaveRequest('/api/leave/me')"));
 assert.ok(ui.includes("leaveRequest('/api/leave/requests')"));
 assert.ok(ui.includes('renderLeaves(leaves.mine)'));
 assert.ok(ui.includes("await leaveRequest('/api/leave/requests',{startDate:"));
 assert.ok(ui.includes("context.writesEnabled!==true"));
 assert.ok(ui.includes("await Promise.all([loadPersonal(),loadLeave()])"));
 assert.equal(ui.includes('renderLeaves(leaves.toReview)'),false);
 assert.ok(server.includes("app.get('/api/leave/requests',requireUser"));
 assert.ok(server.includes("app.post('/api/leave/requests',requireUser,requireWrites"));
 assert.ok(server.includes("leave.where('personDiscordId','==',req.bpd.discordId)"));
});

test('Mijn verlofaanvragen staat onmiddellijk na verificatiedatum, vóór de vernieuwknoppen en rolkaarten',()=>{
 const html=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 const lastVerified=html.indexOf('<dd id="verified">');
 const leave=html.indexOf('<section class="leave-box" id="myLeave"');
 const refresh=html.indexOf('<div class="profile-actions">');
 const roles=html.indexOf('<div class="profile-columns">');
 assert.ok(lastVerified>=0&&lastVerified<leave,'Laatste verificatie moet boven de verlofaanvraag staan');
 assert.ok(leave<refresh&&refresh<roles,'Verlof moet voor de knoppen en het rol-, specialisatie- en opleidingsoverzicht staan');
 assert.equal(html.split('id="myLeave"').length-1,1);
});
