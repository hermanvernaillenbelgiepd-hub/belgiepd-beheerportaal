import test from 'node:test';
import assert from 'node:assert/strict';
import {installManagementDemoRoutes,DEMO_SUBJECTS} from '../src/management-demo.js';
import {reportSections} from '../src/management-utils.js';
import {policeCallBand} from '../src/police-rank-bands.js';
import {canonicalPromotionRank} from '../src/promotion-proposal-policy.js';

function fixture(){
  const endpoints=new Map();
  const app={
    get:(path,...handlers)=>endpoints.set('GET '+path,handlers.at(-1)),
    post:(path,...handlers)=>endpoints.set('POST '+path,handlers.at(-1)),
    patch:(path,...handlers)=>endpoints.set('PATCH '+path,handlers.at(-1))
  };
  installManagementDemoRoutes(app,{requireUser:(_req,_res,next)=>next()});
  function request(method,path,actor,{body={},query={},params={}}={}){
    const action=endpoints.get(method+' '+path);
    assert.ok(action,'DEMO-route niet geïnstalleerd: '+path);
    const response={statusCode:200,status(code){this.statusCode=code;return this},json(value){this.data=value;return this}};
    action({bpd:actor,body,query,params},response);
    return {status:response.statusCode,data:response.data};
  }
  return request;
}
const officer=(uid,departments=['politie'])=>({
  uid,role:'officierenkader',departments,departmentRoles:{politie:'officierenkader'},
  dossierAllowedDepartments:departments,dossierNativeDepartments:departments
});
const target=DEMO_SUBJECTS.find(x=>x.dept==='politie');

test('Twaalf duidelijk fictieve medewerkers met ongeldige, niet-echte Discord-ID',()=>{
  assert.equal(DEMO_SUBJECTS.length,12);
  for(const p of DEMO_SUBJECTS){
    assert.ok(p.name.startsWith('[DEMO]'));
    assert.ok(p.call.startsWith('TEST-'));
    assert.ok(!/^\\d{15,22}$/.test(p.discordId));
    assert.equal(p.demo,true);
  }
});
test('Oefennotitie blijft alleen bij aangemelde tester, een reset herstelt voorbeelden',()=>{
  const invoke=fixture(),actor=officer('demo-case-actor'),other=officer('demo-other-actor');
  const query={dept:target.dept,discordId:target.discordId};
  const initial=invoke('GET','/api/management/demo/entries',actor,{query});
  assert.ok(initial.data.entries.length>=1);
  const before=initial.data.entries.length;
  const result=invoke('POST','/api/management/demo/entries',actor,{body:{
    ...query,type:'notitie',eventDate:new Date().toISOString().slice(0,10),
    details:'[DEMO] oefenregistratie'
  }});
  assert.equal(result.status,201);
  assert.equal(invoke('GET','/api/management/demo/entries',actor,{query}).data.entries.length,before+1);
  assert.equal(invoke('GET','/api/management/demo/entries',other,{query}).data.entries.length,before);
  assert.equal(invoke('POST','/api/management/demo/reset',actor).status,200);
  assert.equal(invoke('GET','/api/management/demo/entries',actor,{query}).data.entries.length,before);
});
test('Nooit gewone Discord-ID of niet-toegestane hulpdienst als oefendoel',()=>{
  const invoke=fixture(),actor=officer('demo-permissions-actor');
  const result=invoke('POST','/api/management/demo/entries',actor,{body:{
    dept:'politie',discordId:'123456789012345678',type:'notitie',
    eventDate:'2026-10-23',details:'Zou niet mogen'
  }});
  assert.equal(result.status,403);
  const outside=DEMO_SUBJECTS.find(p=>p.dept==='brandweer');
  assert.equal(invoke('GET','/api/management/demo/entries',actor,{query:{
    dept:outside.dept,discordId:outside.discordId
  }}).status,403);
});
test('Voorbeeld-weekrapport wordt uitsluitend uit fictieve in-memory registraties samengesteld',()=>{
  const invoke=fixture(),actor=officer('demo-weekreport-actor');
  const date=new Date().toISOString().slice(0,10);
  const result=invoke('GET','/api/management/demo/report',actor,{query:{
    dept:'politie',periodStart:date,periodEnd:date
  }});
  assert.equal(result.status,200);
  assert.equal(result.data.demo,true);
  assert.ok(result.data.sections.every(section=>section.entries.every(e=>e.demoRecord===true)));
  assert.ok(result.data.disclaimer.includes('Firestore'));
  assert.equal(result.data.report.status,'concept');
  assert.equal(reportSections([{type:'observatie',eventDate:date,testRecord:true}],date,date)
    .find(x=>x.type==='observatie').entries.length,0);
});

test('Iedere fictieve politiecall 1xx–8xx heeft de juiste geregistreerde graad',()=>{
  const police=DEMO_SUBJECTS.filter(p=>p.dept==='politie');
  assert.equal(police.length,9);
  for(const person of police){
    const band=policeCallBand(person.call);
    assert.ok(band?.rank,person.call);
    assert.equal(canonicalPromotionRank(person.rank),band.rank,person.call);
  }
});
