import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const style=readFileSync(new URL('../public/organogram-hybrid.css',import.meta.url),'utf8');
const resolver=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
const helper=page.slice(page.indexOf('function makeServiceProfileGrade('),page.indexOf('function openPersonProfile(p){'));
test('standalone grade plate renders under portrait for Brandweer and Burger only',()=>{
 assert.match(page,/const badge=makeServiceProfileGrade\(portraitPerson,displayRank\);/);
 assert.match(page,/\['brandweer','burger'\]\.includes\(p\.dept\)/);
 assert.doesNotMatch(page,/\['brandweer','ambulance','burger'\]\.includes\(p\.dept\)/);
 assert.match(helper,/if\(!\['brandweer','burger'\]\.includes\(department\)\)return null/);
 assert.match(helper,/selected\?\.rankUrl\|\|legacyImage\|\|''/);
 assert.doesNotMatch(helper,/rankSpecialtyUrl/);
 assert.match(page,/if\(p\.dept==='politie'\)\{/);
});
test('portrait-style Brandweer badge and landscape Burger plate never distort imagery',()=>{
 assert.match(style,/\.person-profile-service-grade-vertical \.person-profile-service-grade-image-slot\{[\s\S]*?width:94px;height:122px/);
 assert.match(style,/\.person-profile-service-grade-horizontal \.person-profile-service-grade-image-slot\{[\s\S]*?aspect-ratio:16 \/ 5/);
 assert.match(style,/\.person-profile-service-grade-image\{[\s\S]*?object-fit:contain/);
 assert.match(style,/max-width:540px/);
});
test('verified citizen BIO grade takes priority over a misleading Burger fallback',()=>{
 assert.match(helper,/groups\.includes\('Burger IO'\)\?'burger_in_opleiding'/);
 const s=resolver.replace(/^import\s+[^;]+;$/gm,'');
 const ctx={window:{},citizenUniformRank:person=>
  person.burgerGroups?.includes('Burger IO')?'burger_in_opleiding':'burger',
  getTier:()=>'',policeUniformGroup:()=>'',ambulanceFunction:()=>'',depannageFunction:()=>'',policeCallSeries:()=>''};
 runInNewContext(s,ctx);
 const rank='/api/role-artwork/file/rank_burger_bio?v=1';
 const person={dept:'burger',rank:'Burger',burgerGroups:['Burger IO'],call:'—'};
 ctx.window.BPDUniformAssignments.setData([],[{key:'rank_burger_bio',imageUrl:rank}],[
  {department:'burger',kind:'rank',scope:'rank',selector:'burger_in_opleiding',assetCode:'bio'}
 ]);
 assert.equal(ctx.window.BPDUniformAssignments.forPerson(person).rankUrl,rank);
});
test('grade plate uses existing library artwork and a no-link placeholder',()=>{
 assert.match(helper,/serviceRankArtworks\.get\('rank_'\+department\+'_'\+code\)/);
 assert.match(helper,/Graadteken nog niet gekoppeld/);
 assert.match(helper,/badge\.onerror=\(\)=>slot\.replaceChildren\(fallback\(\)\)/);
 assert.match(helper,/frame\.append\(slot,info\)/);
});

test('Burger profile omits the entire specializations section, not only its content',()=>{
 const start=page.indexOf("if(p.dept!=='burger'){\n const specBox=el('section','person-profile-specialization-box');");
 const spec=page.indexOf("specBox.append(el('h3','','Specialisaties'))");
 const append=page.indexOf("secondary.append(specBox);");
 const close=page.indexOf("if(!dialog.open)dialog.showModal();",start);
 assert.ok(start>0&&spec>start&&append>spec&&close>append);
 assert.match(page.slice(start,close),/\n \}\n $/);
 assert.match(page.slice(0,start),/secondary\.append\(awardsBox\);/);
 assert.match(page,/if\(p\.dept==='politie'\)\{/);
 assert.match(page,/if\(!\['brandweer','burger'\]\.includes\(department\)\)return null/);
});
