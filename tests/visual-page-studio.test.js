import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('all managed screens load responsive page-design through common navigation',()=>{
 const nav=read('public/bpd-navigation.js');
 const client=read('public/bpd-page-design.js');
 const css=read('public/bpd-responsive-layout.css');
 assert.match(nav,/pageDesign.src='\/bpd-page-design.js'/);
 assert.match(client,/fetch\('\/api\/visual-design\/page\/'/);
 assert.match(client,/dataset.bpdDesignCard/);
 assert.match(client,/data-bpd-design-page/);
 assert.match(client,/if\(!\/\^\[a-z\]/);
 assert.match(css,/repeat\(auto-fit,minmax\(min\(100%,var\(--bpd-page-grid-min\)\),1fr\)\)/);
 assert.match(css,/@media\(max-width:580px\)/);
 for(const page of ['index','beheercentrum','brandweerdossier','personeelsbeheer',
  'burger-personeelsdossiers','activiteitscentrum','dossiercentrum',
  'organogram-hierarchie','meldingen','opleidingscentrum','verlofbeheer']){
  assert.match(read('public/'+page+'.html'),/\/bpd-navigation\.js/,
    page+' must have common style support');
 }
});
test('standalone design studio displays pages, card inspector, colors and temporary grants',()=>{
 const html=read('public/vormgeving.html');
 const editor=read('public/visual-page-editor.js');
 const grants=read('public/visual-design-grants-editor.js');
 for(const id of ['studioPage','studioTarget','studioTheme','studioSave','studioClearPage',
  'studioInspect','studioChangeCount','studioPreviewCard','studioGridFields',
  'studio-Bg','studio-Text','studio-Border','studio-fontFamily','studio-fontSize',
  'studio-columns','studio-minColumnWidth','studioReason','visualDesign']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/card-60/);
 assert.match(html,/setupVisualDesignGrantsEditor\(\{api,\$\}\)/);
 assert.match(html,/config\?\.canDelegate===true/);
 assert.match(editor,/page-admin\//);
 assert.match(editor,/expectedRevision:revision/);
 assert.match(editor,/studioTheme/);
 assert.match(grants,/action:'revoke'/);
 assert.match(read('public/beheercentrum.html'),/href="\/vormgeving\.html" id="visualDesignTile"/);
});
test('production routing and presentation do not grant dossier or technical privileges',()=>{
 const server=read('src/server.js');
 assert.match(server,/installVisualPageDesignRoutes\(app,\{requireUser\}\)/);
 assert.match(server,/app.use\('\/api\/visual-design',express.json\(\{limit:'48kb'/);
 const route=read('src/visual-page-design-routes.js');
 assert.match(route,/canEditPages\(dbFactory\(\),req.bpd\)/);
 assert.match(route,/isActiveVisualDesignGrant/);
 assert.doesNotMatch(route,/dossierFullDepartments\s*=/);
 assert.doesNotMatch(route,/portalTechnicalMode\s*=/);
});
