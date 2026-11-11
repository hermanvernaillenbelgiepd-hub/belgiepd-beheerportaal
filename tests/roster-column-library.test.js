import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRosterHeaderLink,validatePersonnelArtwork,POLICE_ROSTER_HEADER_CODES} from '../src/role-artwork-routes.js';
import {validateLibraryUpload,UNIFORM_LIBRARY_KINDS} from '../src/uniform-library-routes.js';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const codes=['interventie','radio_bm','siv_wpr','signalisatie','motard','semi_ano','k9','rago','disp','to','ae','recherche'];
test('twaalf vaste kolomcodes, geen willekeurige rollen of diensten',()=>{
 assert.deepEqual(POLICE_ROSTER_HEADER_CODES,codes);
 assert.equal(UNIFORM_LIBRARY_KINDS.includes('roster_header'),true);
 const request={code:'radio_bm',label:'Radio BM',sourceArtworkKey:'specialty_politie_bmupdate',reason:'Nieuwe officiële kopafbeelding'};
 assert.equal(validateRosterHeaderLink(request).key,'roster_header_politie_radio_bm');
 for(const changed of [
  {...request,code:'admin'},
  {...request,sourceArtworkKey:'specialty_brandweer_bmupdate'},
  {...request,sourceArtworkKey:'roster_header_politie_radio_bm'},
  {...request,sourceArtworkKey:'specialty_politie_bad!'},
  {...request,reason:'kort'},
  {...request,department:'politie'}
 ])assert.throws(()=>validateRosterHeaderLink(changed));
});
test('directe WebP-upload wordt voor alleen politie en bekende codes aanvaard',()=>{
 const data=Buffer.concat([Buffer.from('RIFF'),Buffer.from([22,0,0,0]),Buffer.from('WEBPVP8 '),Buffer.alloc(14)]).toString('base64');
 // Both validators reject bogus images before any write.
 const form={kind:'roster_header',department:'politie',code:'radio_bm',
  label:'Radio BM',reason:'Afbeelding vernieuwen',dataUrl:'data:image/webp;base64,'+data};
 assert.throws(()=>validateLibraryUpload({...form,department:'brandweer'}));
 assert.throws(()=>validateLibraryUpload({...form,code:'random'}));
 assert.throws(()=>validatePersonnelArtwork({...form,department:'brandweer'}));
 assert.throws(()=>validatePersonnelArtwork({...form,code:'random'}));
});
test('beeldbibliotheek toont eigen categorie en maakt kolompatch direct of uit bestaande patch',()=>{
 const html=file('public/beeldbibliotheek.html');
 assert.match(html,/roster_header','Personeelslijst – kolompatches/);
 assert.match(html,/id="rosterHeaderPreset"/);
 assert.match(html,/id="rosterHeaderSource"/);
 assert.match(html,/\/api\/role-artwork\/roster-header-link/);
 assert.match(html,/rosterHeaderPreset'\)\.value=code/);
 assert.match(html,/kind==='roster_header'/);
 assert.match(html,/rosterHeaderPanel'\)\.hidden=!rosterHeader/);
});
test('de personeelslijst geeft alleen kolompatch voorrang op gewone badge',()=>{
 const visual=file('public/personnel-list-visuals.js');
 const routes=file('src/role-artwork-routes.js');
 assert.match(visual,/artwork\('roster_header','politie',alias\)/);
 assert.match(visual,/artwork\('patch',dept,alias\)/);
 assert.match(visual,/setArtworkManifest/);
 assert.match(routes,/app\.put\('\/api\/role-artwork\/roster-header-link'/);
 assert.match(routes,/link_roster_header_artwork/);
 assert.match(routes,/permissionsChanged:false/);
 assert.match(routes,/\['patch','specialty'\]\.includes\(sourceSnap\.get\('kind'\)\)/);
});
