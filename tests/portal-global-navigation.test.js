import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=[
 'bronnen','discord-status','dossiercentrum','gebruikersbeheer','index',
 'meldingen','personeel-koppelen','personeelsbeheer','registraties','roepnummers',
 'rollen-opleidingen','to-dienstbord','verlofbeheer','weekrapporten'];
test('Terug en Home zijn gedeelde navigatie op alle actieve MAIN-portaalpagina’s',()=>{
 for(const p of pages){
   const html=read('public/'+p+'.html');
   assert.equal((html.match(/src="\/bpd-navigation\.js"/g)||[]).length,1,p+' navigation script');
   assert.equal((html.match(/href="\/bpd-navigation\.css"/g)||[]).length,1,p+' navigation style');
 }
 const js=read('public/bpd-navigation.js');
 assert.doesNotThrow(()=>new Script(js));
 assert.ok(js.includes('if(window.self!==window.top)return'));
 assert.ok(js.includes("window.history.back()"));
 assert.ok(js.includes("window.location.assign('/')"));
 assert.ok(js.includes("previous.origin===now.origin"));
 assert.ok(js.includes("home.href='/'"));
 assert.ok(js.includes('if(document.getElementById(\'bpdGlobalNavigation\'))return'));
});
test('Technische personeelsbronmeldingen worden via server-geverifieerd Bestuur afgeschermd',()=>{
 const api=read('src/personnel-editor-routes.js');
 const ui=read('public/personeelsbeheer.html');
 assert.ok(api.includes('canViewPersonnelDiagnostics:req.bpd.boardPersonnelAdmin===true'));
 assert.ok(ui.includes("$('mode').hidden=data.canViewPersonnelDiagnostics!==true"));
 assert.ok(ui.includes("if(data.canViewPersonnelDiagnostics!==true)$('notice').hidden=true"));
 assert.ok(ui.includes("function notice(text,bad=false){$('notice').hidden=false;"));
 assert.ok(ui.includes("if(data.limited||data.pendingLimited)"));
});
test('Dossiercentrum gebruikt direct de gecombineerde fiche zonder tweede doorklik',()=>{
 const html=read('public/dossiercentrum.html');
 assert.ok(html.includes("frame.src='/personeelsbeheer.html?'"));
 assert.equal(html.includes('Open volledige personeelsfiche · observaties & sancties'),false);
 assert.equal(html.includes('detailLinks(data,r)'),false);
 assert.equal(html.includes('id="detailLinks"'),false);
});
