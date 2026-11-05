import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {validateLibraryRule,UNIFORM_LIBRARY_RULE_KINDS} from '../src/uniform-library-routes.js';
import {validateSpecialtyRoleLinks} from '../src/specialty-role-link-routes.js';
const repoFile=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('existing uniform-photo artwork can be reused as a grade and a coat',()=>{
 assert.ok(UNIFORM_LIBRARY_RULE_KINDS.includes('uniform'));
 const common={department:'brandweer',scope:'rank',selector:'zonechef',
  assetKind:'uniform',assetCode:'zone',reason:'Koppeling voor zonecommandant'};
 const coat=validateLibraryRule({...common,kind:'uniform'});
 const grade=validateLibraryRule({...common,kind:'rank'});
 assert.equal(coat.key,'brandweer_uniform_rank_zonechef');
 assert.equal(grade.key,'brandweer_rank_rank_zonechef');
 assert.equal(grade.assetKind,'uniform');
 assert.equal(Object.hasOwn(grade,'permissions'),false);
 assert.equal(Object.hasOwn(grade,'roleId'),false);
 assert.throws(()=>validateLibraryRule({...common,kind:'medal'}),/soort/);
 assert.throws(()=>validateLibraryRule({...common,assetKind:'award',kind:'rank'}),/soort/);
});
test('cross-category artwork rules are applied to Brandweer without role changes',()=>{
 const source=repoFile('public/uniform-assignment-display.js').replace(/^import\s+[^;]+;$/gm,'');
 const context={window:{},getTier:()=>'',policeUniformGroup:()=>'',ambulanceFunction:()=>'',depannageFunction:()=>'',policeCallSeries:()=>''};
 runInNewContext(source,context);
 const url='/api/role-artwork/file/uniform_brandweer_zone?v=1234';
 const picture={key:'uniform_brandweer_zone',imageUrl:url};
 context.window.BPDUniformAssignments.setData([],[picture],[
  {department:'brandweer',kind:'uniform',assetKind:'uniform',scope:'rank',selector:'zonechef',assetCode:'zone'},
  {department:'brandweer',kind:'rank',assetKind:'uniform',scope:'rank',selector:'zonechef',assetCode:'zone'}
 ]);
 const selected=context.window.BPDUniformAssignments.forPerson({dept:'brandweer',rank:'Zonecommandant',call:'ZONE-01'});
 assert.equal(selected.uniformUrl,url);
 assert.equal(selected.rankUrl,url);
});
test('old kind-less rules still resolve the original image category',()=>{
 const r=validateLibraryRule({department:'brandweer',kind:'rank',scope:'rank',
  selector:'sergeant',assetCode:'sergeant',reason:'Bestaande koppeling behouden'});
 assert.equal(r.assetKind,'rank');
});
test('a photo may visually represent an existing medical specialty',()=>{
 const mapping=validateSpecialtyRoleLinks({expectedRevision:0,reason:'Medische patch als afbeelding',links:[
  {roleId:'',label:'MIP',level:'Volwaardig',value:'Ja',assetKey:'uniform_ambulance_mip'}
 ]},'ambulance',['MIP'],[]);
 assert.equal(mapping.links[0].assetKey,'uniform_ambulance_mip');
 assert.equal(Object.hasOwn(mapping,'discordRolesChanged'),false);
});
test('the upload category no longer blocks visual targets in the image library',()=>{
 const page=repoFile('public/beeldbibliotheek.html');
 assert.match(page,/id="linkUniformEnabled"/);
 assert.match(page,/id="linkRankEnabled"/);
 assert.match(page,/id="linkRoleEnabled"/);
 assert.match(page,/assetKind:item\.kind/);
 assert.match(page,/const VISUAL_LINK_KINDS=new Set/);
});
test('Uniformatelier remains directly accessible from management',()=>{
 const page=repoFile('public/gebruikersbeheer.html');
 const composer=repoFile('public/uniform-composer-ui.js');
 assert.match(page,/window\.location\.hash==='#uniformbeheer'\?'uniform'/);
 assert.match(composer,/const rights=await api\('\/api\/uniform-library\/status'\)/);
 assert.match(page,/id="uniformComposer"/);
});
