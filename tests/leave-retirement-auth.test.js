import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canRetireDossierRecord} from '../src/dossier-retirement-policy.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const id='111111111111111111',subjectId='222222222222222222';
const officer={uid:'discord:'+id,discordId:id,role:'officierenkader',
 departments:['politie'],departmentRoles:{politie:'officierenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
const subject={dept:'politie',personId:subjectId,call:'501',
 rank:'Eerste Inspecteur van Politie'};

test('police officer may retire approved historical leave in another basic-cadre dossier',()=>{
 assert.equal(canRetireDossierRecord(officer,subject),true);
 assert.equal(canRetireDossierRecord({...officer,role:'korpsleiding',
  departmentRoles:{politie:'korpsleiding'}},subject),true);
 assert.equal(canRetireDossierRecord({...officer,role:'middenkader',
  departmentRoles:{politie:'middenkader'}},subject),false);
 assert.equal(canRetireDossierRecord({...officer,dossierAllowedDepartments:[]},subject),false);
 assert.equal(canRetireDossierRecord({...officer,dossierNativeDepartments:[]},subject),false);
 assert.equal(canRetireDossierRecord(officer,{...subject,personId:id}),false);
});

test('leave-retire route uses verified dossier middleware, unlike normal self-withdrawal',()=>{
 const server=read('src/server.js'),leave=read('src/leave-routes.js');
 assert.match(server,/installLeaveRoutes\(app,\{requireUser,requireDossierUser,getSnapshot,accessList\}\)/);
 assert.match(leave,/app\.post\('\/api\/leave\/requests\/:id\/retire',requireDossierUser,requireWrites/);
 assert.match(leave,/app\.post\('\/api\/leave\/requests\/:id\/withdraw',requireUser,requireWrites/);
 assert.match(leave,/if\(!subject\|\|!canRetireDossierRecord\(req\.bpd,subject\)\)/);
 assert.match(leave,/item\.personDiscordId!==subject\.personId\|\|item\.status!=='approved'/);
 assert.match(leave,/writeLeaveEvent\(tx,\{requestRef:ref,request:item,action:'cadre_retired'/);
});
