import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serviceHierarchy} from '../public/assets/organogram-hierarchie-model.js';

const police=(name,call,teachingRoles=[])=>({
 dept:'politie',name,call,rank:'Politie',teachingRoles,specialties:[]
});

test('police corps leadership follows callsign 900 before 910 even when 910 instructs',()=>{
 const rows=[police('Extra','910',['instructeur']),police('Thijs','900')];
 const result=serviceHierarchy(rows,'politie').leadership[0].members;
 assert.deepEqual(result.map(x=>x.name),['Thijs','Extra']);
 assert.deepEqual(result.map(x=>x.call),['900','910']);
 assert.deepEqual(rows.map(x=>x.call),['910','900'],'source input is not mutated');
});

test('all police cadres use callsign ranking regardless of instructor status',()=>{
 const rows=[
  police('Officer 930','930',['instructeur']),
  police('Officer 920','920'),
  police('Inspecteur 430','430',['instructeur']),
  police('Inspecteur 400','400'),
  police('Agent 220','220',['instructeur']),
  police('Agent 200','200')
 ];
 const levels=serviceHierarchy(rows,'politie').leadership;
 assert.deepEqual(levels.find(x=>x.label==='Officierenkader').members.map(x=>x.call),['920','930']);
 assert.deepEqual(levels.find(x=>x.label==='Basiskader').members.map(x=>x.call),['400','430']);
 assert.deepEqual(levels.find(x=>x.label==='Agentenkader').members.map(x=>x.call),['200','220']);
});

test('rendered police cadre cards preserve rank order and instructors remain labelled',()=>{
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(html,/function cadrePeopleList\(rows,levelLabel=''\)\{[\s\S]*?peopleList\(rows,rows\[0\]\?\.dept==='politie'\)/);
 assert.match(html,/INSTRUCTEUR|instructeur/);
});
