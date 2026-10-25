import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retirementReason} from '../src/dossier-retirement-policy.js';

const code=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('dossier retirement parses JSON before its secured POST route',()=>{
 const server=code('src/server.js');
 const route=code('src/dossier-retirement-routes.js');
 const parser="app.use('/api/dossier-retirement',express.json({limit:'4kb',strict:true}));";
 assert.ok(server.includes(parser),'missing express JSON parser for dossier retirement');
 assert.ok(server.indexOf(parser)<server.indexOf('installDossierRetirementRoutes(app,'),
  'JSON middleware must be mounted before the write endpoint');
 assert.match(route,/app\.post\('\/api\/dossier-retirement\/:dept\/:discordId\/:source\/:entryId'/);
 assert.match(route,/reason=retirementReason\(req\.body\)/);
 assert.match(route,/if\(!canRetireDossierRecord\(req\.bpd,subject\)\)/);
 assert.match(route,/tx\.create\(audit,change\)/);
 assert.match(route,/tx\.create\(reportEntry,/);
});
test('the browser sends the reason-only payload required by retirement policy',()=>{
 const browser=code('public/personeelsbeheer.html');
 assert.match(browser,/method:'POST',body:\{reason\}/);
 const payload=JSON.parse(JSON.stringify({reason:'Ongeldige testobservatie in dossier'}));
 assert.equal(retirementReason(payload),'Ongeldige testobservatie in dossier');
 assert.throws(()=>retirementReason({reason:'Ongeldige testobservatie',extra:true}),/Ongeldige wisaanvraag/);
});
