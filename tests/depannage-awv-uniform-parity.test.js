import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {depannageFunction} from '../public/uniform-profile-policy.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const art=(kind,code)=>({key:kind+'_depannage_'+code,
 imageUrl:'/api/role-artwork/file/'+kind+'_depannage_'+code+'?v=verified'});
const member={dept:'depannage',name:'TEST AWV',call:'',rank:'Operationeel lid Depannage',
 leadershipTier:'Leiding / AWV',depannageGroups:['awv','lsra','fast'],
 specialties:['F.A.S.T','LSRA','CRANE']};
test('Depot uniform uses actual AWV/LSRA/FAST organogram classification even without a callsign',()=>{
 assert.equal(depannageFunction(member),'awv');
 assert.equal(depannageFunction({...member,leadershipTier:'none',depannageGroups:['awv']}),'awv');
 assert.equal(depannageFunction({...member,leadershipTier:'none',depannageGroups:['lsra']}),'lsra');
 assert.equal(depannageFunction({...member,leadershipTier:'none',depannageGroups:['fast']}),'fast');
 assert.equal(depannageFunction({...member,leadershipTier:'LSRA',depannageGroups:[]}), 'lsra');
 assert.equal(depannageFunction({...member,leadershipTier:'FAST',depannageGroups:[]}), 'fast');
 assert.equal(depannageFunction({...member,leadershipTier:'none',depannageGroups:[],
  call:'',rank:'Operationeel lid Depannage'}),'lsra');
 assert.equal(depannageFunction({...member,dept:'brandweer'}),'');
});
test('Saved AWV uniform overrides obsolete service default, but not an explicit personal image',()=>{
 const script=source('public/uniform-assignment-display.js').replace(/^import\s+[^;]+;$/gm,'');
 const ctx={window:{},getTier:()=>'',policeUniformGroup:()=>'',ambulanceFunction:()=>'', 
  ambulanceUniformFallback:()=>'',depannageFunction,citizenUniformRank:()=>'',policeCallSeries:()=>''};
 runInNewContext(script,ctx);
 const api=ctx.window.BPDUniformAssignments;
 const orange=art('uniform','awv_oranje'),yellow=art('uniform','oud_geel'),
  personal=art('uniform','persoonlijk');
 const oldService={department:'depannage',kind:'uniform',scope:'service',
  selector:'default',assetCode:'oud_geel'};
 const composed={department:'depannage',scope:'function',selector:'awv',
  assets:{uniform:'awv_oranje'},layers:{}};
 api.setData([],[orange,yellow,personal],[oldService],[],[composed]);
 assert.equal(api.forPerson(member).uniformUrl,orange.imageUrl);
 assert.equal(api.forPerson({...member,depannageGroups:['lsra'],leadershipTier:'LSRA'})
  .uniformUrl,yellow.imageUrl);
 api.setData([],[orange,yellow,personal],[oldService,
  {department:'depannage',kind:'uniform',scope:'person',selector:'call_mathias',
   assetCode:'persoonlijk'}],[],[composed]);
 assert.equal(api.forPerson({...member,call:'MATHIAS'}).uniformUrl,personal.imageUrl);
});
test('Organogram uses the real depot classification, not a formatted text copy',()=>{
 const html=source('public/organogram-hierarchie.html');
 assert.match(html,/p\.dept==='depannage'\?makeServiceUniformPortrait\(p\)/);
 assert.match(html,/const portraitPerson=p\.dept==='burger'\?/);
 assert.match(html,/depannage-awvrank-20261106/);
 assert.match(html,/depannageGroups:p\.dept==='depannage'/);
 assert.match(html,/BPDUniformAssignments\?\.setData/);
});
