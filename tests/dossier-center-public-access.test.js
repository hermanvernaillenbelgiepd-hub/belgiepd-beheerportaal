import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {installDossierCenterRoutes} from '../src/dossier-center-routes.js';
import {dossierScopes,dossierOverviewRows} from '../src/dossier-center-policy.js';

const first='111111111111111111',second='222222222222222222';
const person=(dept,id,call)=>({dept,personId:id,name:'Test '+call,call,rank:'Inspecteur',
  status:'Actief',privateObservation:'mag nooit openbaar',notes:['intern']});
const fullRoster=[
  person('politie',first,'S300'),person('politie',second,'S301'),
  person('ambulance',first,'AMB-1'),person('depannage',first,'AWV-1')
];
function mockRes(){
  return {statusCode:200,body:null,status(code){this.statusCode=code;return this},
    json(body){this.body=body;return this}};
}
test('Publieke personeelslijst bevat geen Discord-ID en geen dossierinformatie',async()=>{
  const old=process.env.BPD_ENABLE_DOSSIER_CENTER;
  process.env.BPD_ENABLE_DOSSIER_CENTER='true';
  try{
    const routes=new Map();
    installDossierCenterRoutes({get:(path,...handlers)=>routes.set(path,handlers)},
      {requireUser:()=>{},getSnapshot:async()=>({data:fullRoster,stale:false})});
    const response=mockRes();
    await routes.get('/api/dossiercentrum/public-roster')[0]({},response);
    assert.equal(response.statusCode,200);
    assert.equal(response.body.rows.length,4);
    assert.deepEqual(Object.keys(response.body.rows[0]).sort(),
      ['call','dept','name','personnel','rank','status'].sort());
    assert.equal(JSON.stringify(response.body).includes(first),false);
    assert.equal(JSON.stringify(response.body).includes('intern'),false);
    assert.equal(routes.get('/api/dossiercentrum/overview').length,2,
      'Privé-overzicht vereist bestaande aanmeldcontrole');
  }finally{
    if(old===undefined)delete process.env.BPD_ENABLE_DOSSIER_CENTER;
    else process.env.BPD_ENABLE_DOSSIER_CENTER=old;
  }
});
test('Meerdere diensten behouden aparte dossiers voor dezelfde Discord-identiteit',()=>{
  const actor={dossierAllowedDepartments:['politie','depannage']};
  const allowed=dossierScopes(actor);
  assert.deepEqual(allowed.personnelDepartments,['politie','depannage']);
  const list=dossierOverviewRows(fullRoster,[],allowed);
  assert.equal(list.length,3);
  assert.equal(list.filter(p=>p.discordId===first).length,2);
  assert.equal(list.some(p=>p.dept==='ambulance'),false);
});
test('Dossiercentrum toont FICHE alleen na beveiligde koppeling en embed behoudt API-rechten',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  const staff=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const api=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  assert.match(html,/r\.canOpen===true/);
  assert.match(html,/securedRows=secured\.rows/);
  assert.match(html,/inlinePersonnelFrame/);
  assert.match(html,/Mijn dossierdiensten/);
  assert.match(html,/public-roster/);
  assert.match(staff,/dossierEmbedded/);
  assert.match(staff,/bpd-dossier-embed-size/);
  assert.match(api,/canReadServiceDossier\(req\.bpd,d\)/);
  for(const document of [html,staff]){
    const scripts=[...document.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1);
    const stripped=scripts[0][1].replace(/^import [\s\S]*?from '[^']+';\s*/gm,'');
    assert.doesNotThrow(()=>new Script(stripped));
  }
});
