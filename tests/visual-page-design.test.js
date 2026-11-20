import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {listDesignPages,validDesignPage,validatePageDesignWrite,
 cleanPageDesign,contrast,equalPageDesign} from '../src/visual-page-design-policy.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const valid={expectedRevision:0,reason:'Duidelijk leesbare nieuwe vormgeving',
 overrides:[{target:'card-2',values:{lightBg:'#FFFFFF',lightText:'#000000',
  darkBg:'#142640',darkText:'#F2F6FF',radius:20,padding:16,fontFamily:'verdana',
  fontSize:16,columns:'auto',minColumnWidth:220}}]};
test('all real pages except emergency board are available',()=>{
 const pages=listDesignPages();
 for(const p of ['index.html','beheercentrum.html','personeelsbeheer.html',
  'brandweerdossier.html','activiteitscentrum.html','burger-personeelsdossiers.html'])
  assert.ok(pages.includes(p),p);
 assert.equal(pages.includes('to-dienstbord.html'),false);
 assert.equal(validDesignPage('../../src/server.js'),false);
 assert.equal(validDesignPage('index.html'),true);
});
test('per-page design is strictly validated, readable and reversible',()=>{
 const v=validatePageDesignWrite('index.html',valid);
 assert.deepEqual(v,valid);
 assert.equal(equalPageDesign({overrides:valid.overrides},{overrides:valid.overrides}),true);
 assert.deepEqual(cleanPageDesign({overrides:[{target:'card-2',values:{padding:20,evil:'x'}}]}),
  {overrides:[{target:'card-2',values:{padding:20}}]});
 assert.ok(contrast('#FFFFFF','#000000')>=21);
 assert.throws(()=>validatePageDesignWrite('index.html',{...valid,
  overrides:[{target:'buttons',values:{lightBg:'#ffffff',lightText:'#ffffff'}}]}));
 for(const bad of [
  {target:'card-61',values:{}},{target:'page',values:{background:'javascript:alert(1)'}},
  {target:'cards',values:{lightBg:'#F00'}},{target:'cards',values:{radius:10000}},
  {target:'cards',values:{fontFamily:'url(evil)'}},{target:'buttons',values:{columns:'six'}}
 ])assert.throws(()=>validatePageDesignWrite('index.html',{...valid,overrides:[bad]}));
 assert.throws(()=>validatePageDesignWrite('to-dienstbord.html',valid));
 assert.throws(()=>validatePageDesignWrite('index.html',{...valid,overrides:[valid.overrides[0],valid.overrides[0]]}));
});
test('page design API is scoped to audited design-only permissions, not personnel roles',()=>{
 const routes=read('src/visual-page-design-routes.js');
 assert.match(routes,/app.get\('\/api\/visual-design\/pages',requireUser/);
 assert.match(routes,/app.get\('\/api\/visual-design\/page-admin\/:page',requireUser/);
 assert.match(routes,/app.put\('\/api\/visual-design\/page-admin\/:page',requireUser/);
 assert.match(routes,/canEditPages\(dbFactory\(\),req.bpd\)/);
 assert.match(routes,/DESIGN_GRANTS_COLLECTION/);
 assert.match(routes,/db.runTransaction\(async tx=>/);
 assert.match(routes,/tx.create\(audit,/);
 assert.match(routes,/permissionsChanged:false/);
});
