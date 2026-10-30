import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUniformLayout,validateUniformNameplate,validateUniformCoat,validateUniformVisibility,UNIFORM_VARIANTS} from '../src/uniform-management-routes.js';

const sample={department:'politie',variant:'silver',
 left:62.3,top:56.75,width:26.6,height:12.25,reason:'Aangepast na controle van de uniformfoto'};
test('police silver and gold uniform coordinates stay independent',()=>{
 assert.deepEqual(UNIFORM_VARIANTS.politie,['silver','gold']);
 assert.deepEqual(UNIFORM_VARIANTS.brandweer,['default']);
 const output=validateUniformLayout(sample);
 assert.equal(output.key,'politie_silver');
 assert.equal(output.left,62.3);
 assert.equal(validateUniformLayout({...sample,variant:'gold'}).key,'politie_gold');
});
test('each service can position a grade plate independently',()=>{
 for(const department of ['brandweer','ambulance','depannage','burger']){
  const r=validateUniformLayout({...sample,department,variant:'default'});
  assert.equal(r.key,department+'_default');
 }
});
test('invalid placement, variant and unmotivated changes are rejected',()=>{
 assert.throws(()=>validateUniformLayout({...sample,left:100}),/binnen het uniform/);
 assert.throws(()=>validateUniformLayout({...sample,width:0}),/volledig binnen/);
 assert.throws(()=>validateUniformLayout({...sample,top:99}),/binnen het uniform/);
 assert.throws(()=>validateUniformLayout({...sample,left:NaN}),/tussen 0 en 100/);
 assert.throws(()=>validateUniformLayout({...sample,variant:'admin'}),/Onbekende/);
 assert.throws(()=>validateUniformLayout({...sample,department:'niet-bestaand'}),/Onbekende/);
 assert.throws(()=>validateUniformLayout({...sample,reason:'kort'}),/Motivering/);
 assert.throws(()=>validateUniformLayout({...sample,permissions:['korpsleiding']}),/Ongeldige/);
});

test('nameplates can be positioned independently for every service',()=>{
 const police=validateUniformNameplate({...sample,left:10.25,top:56.2,width:27.75,height:13.15});
 assert.equal(police.key,'politie_silver');
 assert.equal(police.left,10.25);
 const gold=validateUniformNameplate({...sample,variant:'gold',left:21.2,top:58.9,width:20.1,height:12.1});
 assert.equal(gold.key,'politie_gold');
 for(const department of ['brandweer','ambulance','depannage','burger']){
  const plate=validateUniformNameplate({...sample,department,variant:'default',
   left:11,top:55,width:27,height:12});
  assert.equal(plate.key,department+'_default');
 }
});
test('nameplate placement rejects invalid sizes and privilege fields',()=>{
 assert.throws(()=>validateUniformNameplate({...sample,left:96,width:12}),/binnen het uniform/);
 assert.throws(()=>validateUniformNameplate({...sample,height:1}),/binnen het uniform/);
 assert.throws(()=>validateUniformNameplate({...sample,role:'beheerder'}),/Ongeldige/);
 assert.throws(()=>validateUniformNameplate({...sample,reason:'kort'}),/Motivering/);
});

test('uniform coats can be independently panned and zoomed per service and variant',()=>{
 const basic={department:'politie',variant:'silver',offsetX:-12.5,offsetY:6,zoom:125,
  reason:'Uniform gecentreerd voor de grotere profielfoto'};
 assert.deepEqual(
  Object.fromEntries(['offsetX','offsetY','zoom'].map(k=>[k,validateUniformCoat(basic)[k]])),
  {offsetX:-12.5,offsetY:6,zoom:125});
 for(const department of ['brandweer','ambulance','depannage','burger']){
  assert.equal(validateUniformCoat({...basic,department,variant:'default'}).key,department+'_default');
 }
 assert.equal(validateUniformCoat({...basic,variant:'gold'}).key,'politie_gold');
 assert.throws(()=>validateUniformCoat({...basic,offsetX:60}),/buiten veilige grenzen/);
 assert.throws(()=>validateUniformCoat({...basic,zoom:250}),/buiten veilige grenzen/);
 assert.throws(()=>validateUniformCoat({...basic,zoom:NaN}),/Ongeldige/);
 assert.throws(()=>validateUniformCoat({...basic,roles:['bestuur']}),/Ongeldige/);
});
test('nameplate typography and footer prefix are visual and preserve personal identity',()=>{
 const data={...sample,nameScale:175,callScale:125,prefix:'BELGIEPD / SANTO'};
 const result=validateUniformNameplate(data);
 assert.equal(result.nameScale,175);
 assert.equal(result.callScale,125);
 assert.equal(result.prefix,'BELGIEPD / SANTO');
 assert.equal(Object.hasOwn(result,'personName'),false);
 assert.throws(()=>validateUniformNameplate({...data,nameScale:300}),/Lettergrootte/);
 assert.throws(()=>validateUniformNameplate({...data,callScale:25}),/Lettergrootte/);
 assert.throws(()=>validateUniformNameplate({...data,prefix:'<script>'}),/naamplaattekst/);
 assert.throws(()=>validateUniformNameplate({...data,call:'fake'}),/Ongeldige naamplaatinstellingen/);
});

test('tall original uniform canvases preserve 872×1212 portrait geometry',()=>{
 const input={department:'politie',variant:'gold',offsetX:0,offsetY:0,zoom:100,
  canvasWidth:872,canvasHeight:1212,keepAspectRatio:true,
  reason:'Portretuniform in oorspronkelijke verhouding bewaren'};
 const cfg=validateUniformCoat(input);
 assert.equal(cfg.key,'politie_gold');
 assert.equal(cfg.canvasWidth,872);
 assert.equal(cfg.canvasHeight,1212);
 assert.equal(cfg.keepAspectRatio,true);
 assert.equal(cfg.canvasWidth/cfg.canvasHeight,872/1212);
 assert.equal(validateUniformCoat({...input,keepAspectRatio:false}).keepAspectRatio,false);
});
test('custom uniform canvas rejects extreme sizes and unknown metadata',()=>{
 const base={department:'ambulance',variant:'default',offsetX:0,offsetY:0,zoom:100,
  canvasWidth:872,canvasHeight:1212,keepAspectRatio:true,
  reason:'Gewijzigde afmetingen voor een uniform'};
 for(const invalid of [
  {canvasWidth:0},{canvasHeight:8192},{canvasWidth:NaN},
  {canvasWidth:4000,canvasHeight:4000},{canvasWidth:412.5},
  {keepAspectRatio:'true'},{permissions:['beheerder']}
 ])assert.throws(()=>validateUniformCoat({...base,...invalid}));
 // Existing API users still default to the historical 603x469 canvas.
 const legacy=validateUniformCoat({
  department:'politie',variant:'silver',offsetX:0,offsetY:0,zoom:100,
  reason:'Uniformpositie van voor de canvasupgrade'});
 assert.equal(legacy.canvasWidth,603);
 assert.equal(legacy.canvasHeight,469);
});

test('Ambulance, Brandweer and Depannage can each hide uniform components independently',()=>{
 const fields={showGradePlate:false,showNamePlate:true,showExtraLogo:false,
  showHelmet:false,showProfessionBadge:true};
 for(const department of ['brandweer','ambulance','depannage']){
  const result=validateUniformVisibility({department,variant:'default',...fields,
   reason:'Uniformcomponenten op verzoek van de dienst aanpassen'});
  assert.equal(result.key,department+'_default');
  assert.equal(result.showGradePlate,false);
  assert.equal(result.showNamePlate,true);
  assert.equal(result.showExtraLogo,false);
 }
});
test('uniform visibility changes cannot grant roles or affect police uniforms',()=>{
 const good={department:'brandweer',variant:'default',
  showGradePlate:true,showNamePlate:false,showExtraLogo:true,
  showHelmet:true,showProfessionBadge:false,
  reason:'Naamplaat hoeft op dit uniform niet aanwezig te zijn'};
 assert.equal(validateUniformVisibility(good).showNamePlate,false);
 for(const change of [
  {department:'politie'},{department:'burger'}, {variant:'silver'},
  {showGradePlate:'false'},{showHelmet:1},{showProfessionBadge:null},
  {reason:'kort'},{grantRoles:true},{personId:'123456789012345678'}
 ])assert.throws(()=>validateUniformVisibility({...good,...change}));
});
