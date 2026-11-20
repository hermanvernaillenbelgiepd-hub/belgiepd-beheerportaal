import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 DEFAULT_VISUAL_DESIGN,visualDesignFrom,canManageVisualDesign,
 validateVisualDesignWrite,isVisualDesignSame
} from '../src/visual-design-policy.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='123456789012345678';
const technical={uid:'discord:'+id,discordId:id,role:'beheerder',
 portalTechnicalMode:true,profileTechnicalAvailable:true};
const officer={uid:'discord:'+id,discordId:id,role:'officierenkader',
 departments:['politie'],departmentRoles:{politie:'officierenkader'},
 portalTechnicalMode:false};
const settings={themeDefault:'dark',accent:'teal',fontFamily:'system',
 fontScale:110,density:'comfortable'};
const proposal={...settings,expectedRevision:0,reason:'Verbetering van toegankelijkheid'};

test('centrale vormgeving heeft veilige standaardwaarden en filtert corruptie',()=>{
 assert.deepEqual(visualDesignFrom(undefined),DEFAULT_VISUAL_DESIGN);
 assert.deepEqual(visualDesignFrom({
  themeDefault:'<script>',accent:'red;--foo:bar',fontFamily:'url(http://attacker)',
  fontScale:9999,density:'../../../'
 }),DEFAULT_VISUAL_DESIGN);
 assert.deepEqual(visualDesignFrom(settings),settings);
 assert.equal(isVisualDesignSame(settings,settings),true);
 assert.equal(isVisualDesignSame(settings,{...settings,accent:'violet'}),false);
});
test('vormgeving kan worden beheerd door geverifieerd technisch beheer en Politie OK/KL, niet door andere diensten',()=>{
 assert.equal(canManageVisualDesign(technical),true);
 assert.equal(canManageVisualDesign(officer),true);
 assert.equal(canManageVisualDesign({...officer,role:'korpsleiding',
  departmentRoles:{politie:'korpsleiding'}}),true);
 assert.equal(canManageVisualDesign({...officer,role:'middenkader',
  departmentRoles:{politie:'middenkader'}}),false);
 assert.equal(canManageVisualDesign({...officer,departments:['ambulance'],
  departmentRoles:{ambulance:'officierenkader'}}),false);
 assert.equal(canManageVisualDesign({...technical,profileTechnicalAvailable:false}),false);
 assert.equal(canManageVisualDesign({...officer,uid:'discord:000000000000000000'}),false);
});
test('uitsluitend vooraf toegelaten stijltokens, geen CSS-injectie of onverwachte velden',()=>{
 assert.deepEqual(validateVisualDesignWrite(proposal),proposal);
 const invalid=[
  {...proposal,accent:'#ffffff'},
  {...proposal,accent:'teal; background:red'},
  {...proposal,fontFamily:'url(https://evil.example)'},
  {...proposal,themeDefault:'auto'},
  {...proposal,fontScale:125},
  {...proposal,fontScale:91},
  {...proposal,density:'unknown'},
  {...proposal,expectedRevision:-1},
  {...proposal,reason:'kort'},
  {...proposal,reason:'Toegestaan <script>alert(1)</script>'},
  {...proposal,ownerDiscordId:id}
 ];
 for(const request of invalid)
  assert.throws(()=>validateVisualDesignWrite(request),undefined,
   'Onveilige instellingen mogen niet opgeslagen worden');
});
test('public API bevat uitsluitend configuratie; writes met serverrecht, audit en revisie',()=>{
 const routes=read('src/visual-design-routes.js');
 const server=read('src/server.js');
 assert.match(routes,/app\.get\('\/api\/visual-design\/public',async\(_req,res\)=>/);
 assert.match(routes,/app\.get\('\/api\/visual-design\/admin',requireUser/);
 assert.match(routes,/app\.put\('\/api\/visual-design\/admin',requireUser/);
 assert.match(routes,/if\(!canManageVisualDesign\(req\.bpd\)\)/);
 assert.match(routes,/validateVisualDesignWrite\(req\.body\)/);
 assert.match(routes,/db\.runTransaction\(async tx=>/);
 assert.match(routes,/oldRevision!==input\.expectedRevision/);
 assert.match(routes,/tx\.create\(audit,/);
 assert.match(routes,/permissionsChanged:false,discordRolesChanged:false/);
 assert.match(server,/installVisualDesignRoutes\(app,\{requireUser\}\)/);
 assert.match(server,/app\.use\('\/api\/visual-design',express\.json/);
});
test('alle reguliere hoofdmodules gebruiken één gedeelde vormgeving via de bestaande navigatie',()=>{
 const navigation=read('public/bpd-navigation.js');
 const style=read('public/bpd-visual-design.css');
 const apply=read('public/bpd-visual-design.js');
 assert.match(navigation,/design\.src='\/bpd-visual-design\.js'/);
 assert.match(navigation,/storedTheme\(\)===null/);
 assert.match(navigation,/if\(persist\)try\{window\.localStorage\?\.setItem\(themeKey,currentTheme\)/);
 assert.match(apply,/fetch\('\/api\/visual-design\/public'/);
 assert.match(apply,/window\.BPDVisualDesign/);
 assert.match(apply,/root\.dataset\.bpdDesignAccent=config\.accent/);
 assert.match(style,/--bpd-v-font/);
 assert.match(style,/--bpd-v-accent/);
 assert.match(style,/--bpd-v-font-scale/);
 assert.doesNotMatch(style,/\.rank-code|\.series-r[123]|\.status-active|\.specialty-pictogram/);
 for(const path of [
  'public/index.html','public/personeelsbeheer.html',
  'public/brandweerdossier.html','public/burger-personeelsdossiers.html',
  'public/activiteitscentrum.html','public/opleidingscentrum.html',
  'public/beheercentrum.html'
 ]){
  assert.match(read(path),/\/bpd-navigation\.js/,
   path+' moet centrale stijl- en navigatielaag laden');
 }
});
test('Beheercentrum geeft veilige preview, instellingenherstel en motivering',()=>{
 const html=read('public/beheercentrum.html');
 const editor=read('public/visual-design-editor.js');
 assert.match(html,/id="visualDesignTile" hidden/);
 assert.match(html,/id="visualDesign" class="card" hidden/);
 for(const id of ['visual-themeDefault','visual-accent','visual-fontFamily',
  'visual-fontScale','visual-density','visualReason','visualSave','visualReset',
  'visualDefaults','visualDesignPreview','visualDesignHistory'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/setupVisualDesignEditor\(\{api,\$\}\)/);
 assert.match(editor,/window\.BPDVisualDesign\?\.apply\(values\(\),\{preview:true\}\)/);
 assert.match(editor,/expectedRevision:previous,reason/);
 assert.match(editor,/window\.BPDVisualDesign\?\.restore\(\)/);
 assert.match(editor,/\/api\/visual-design\/admin/);
});
