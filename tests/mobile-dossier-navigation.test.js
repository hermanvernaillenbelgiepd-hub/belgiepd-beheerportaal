import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function runBack({referrer,url='https://administratie.belgiepd.be/dossiercentrum.html',
 historyLength=2,trail=['/meldingen.html','/dossiercentrum.html']}={}){
 const script=source('public/bpd-navigation.js');
 const part=script.match(/  function back\(\)\{[\s\S]*?\n  \}\n  const portalLabelScript=/);
 assert.ok(part,'shared back function exists');
 const actions=[],state=[...trail];
 const window={
  location:{href:url,assign:dest=>actions.push(['assign',dest])},
  history:{length:historyLength,back:()=>actions.push(['back'])}
 };
 const sandbox={window,document:{referrer:referrer||''},URL,here:new URL(url).pathname,
  readStack:()=>[...state],saveStack:next=>actions.push(['save',next]),validPath:v=>v.startsWith('/')&&!v.startsWith('//')};
 runInNewContext(part[0].replace(/\n  const portalLabelScript=$/,'')+'\nback();',sandbox);
 return actions;
}

test('back to an authorized same-origin dossier filter retains browser query state',()=>{
 const a=runBack({referrer:'https://administratie.belgiepd.be/personeelsbeheer.html?weergave=reeksen'});
 assert.deepEqual(a,[['back']]);
});
test('native history also handles two states on the same page',()=>{
 const a=runBack({referrer:'https://administratie.belgiepd.be/dossiercentrum.html?department=politie',
 url:'https://administratie.belgiepd.be/dossiercentrum.html?department=brandweer'});
 assert.deepEqual(a,[['back']]);
});
test('external referrer or direct visits never trigger external back',()=>{
 const external=runBack({referrer:'https://example.com/',trail:['/meldingen.html','/dossiercentrum.html']});
 assert.deepEqual(external[0],['save',['/meldingen.html']]);
 assert.deepEqual(external[1],['assign','/meldingen.html']);
 assert.deepEqual(runBack({referrer:'',trail:['/dossiercentrum.html']}),
   [['assign','/']]);
});
test('dossiercentrum preserves full fields and access checks on mobile',()=>{
 const page=source('public/dossiercentrum.html');
 assert.match(page,/td\.dataset\.label=labels\[index\]/);
 assert.match(page,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(page,/min-width:0;width:100%/);
 assert.match(page,/dossier-cadre-group/);
 assert.match(page,/tr\.className='dossier-empty'/);
 assert.match(page,/if\(r\.canOpen===true\)/);
 assert.match(page,/🔒 Afgeschermd/);
 assert.match(page,/\.scroller table tbody \.dossier-discord\{white-space:normal/);
});
