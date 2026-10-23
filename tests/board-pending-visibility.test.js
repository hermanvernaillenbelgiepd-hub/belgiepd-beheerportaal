import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {installPersonnelEditorRoutes} from '../src/personnel-editor-routes.js';

test('Wacht op Discord-koppeling staat niet meer in Centraal personeelsbeheer',()=>{
  const personnel=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const management=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
  assert.doesNotMatch(personnel,/id="pendingPanel"/);
  assert.doesNotMatch(personnel,/id="pendingResults"/);
  assert.doesNotMatch(personnel,/function renderPending\(/);
  assert.match(management,/id="pendingBoardPanel" hidden/);
  assert.match(management,/id="pendingBoardList"/);
  assert.match(management,/#pendingBoardList\{max-height:none;overflow:visible\}/);
  assert.match(management,/\.pending-board-actions\{display:flex/);
  assert.doesNotMatch(management,/id="pendingBoardList"[^>]*class="scroller"/);
  const script=management.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new Script(script.replace(/^import [^\n]*\n/gm,'')));
});
test('Koppelwachtrij is met serverrechten beschermd en algemene API bevat geen referenties',async()=>{
  const callbacks=new Map();
  const app={
    get:(url,...handlers)=>callbacks.set('GET '+url,handlers),
    post:(url,...handlers)=>callbacks.set('POST '+url,handlers),
    patch:(url,...handlers)=>callbacks.set('PATCH '+url,handlers)
  };
  const authMiddleware=(_req,_res,next)=>next();
  installPersonnelEditorRoutes(app,{
    requireUser:authMiddleware,requireDossierUser:authMiddleware,
    getSnapshot:async()=>({data:[],stale:false})
  });
  assert.ok(callbacks.has('GET /api/personnel/pending-links'));
  const handlers=callbacks.get('GET /api/personnel/pending-links');
  assert.equal(handlers[0],authMiddleware);
  const res={
    code:null,body:null,
    status(code){this.code=code;return this},
    json(body){this.body=body;return this}
  };
  await handlers[1]({bpd:{role:'korpsleiding',boardPersonnelAdmin:false}},res);
  assert.equal(res.code,403);
  assert.match(res.body.error,/Bestuur/);
  const source=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  const overview=source.slice(source.indexOf("app.get('/api/personnel/overview'"),
    source.indexOf("app.get('/api/personnel/pending-links'"));
  assert.doesNotMatch(overview,/pendingPersonnel/);
  assert.doesNotMatch(overview,/PENDING_PERSONNEL_COLLECTION/);
  assert.match(source,/req\.bpd\?\.boardPersonnelAdmin!==true/);
});
