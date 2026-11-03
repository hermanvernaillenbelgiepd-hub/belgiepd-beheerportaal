import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeFolderId,builtInFolders,resolveDocumentUrl,safeYouTubeEmbed} from '../src/document-folder-policy.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Politie krijgt vaste mapnamen en diensten houden hun eigen namespace',()=>{
 assert.deepEqual(builtInFolders('politie').map(x=>x.name),['Motard','Dispatch','K-9']);
 assert.deepEqual(builtInFolders('brandweer'),[]);
 assert.equal(normalizeFolderId(null),null);
 assert.equal(normalizeFolderId('builtin-k9'),'builtin-k9');
 assert.equal(normalizeFolderId('f75e4162-674a-4f55-bf5c-a88c5037ce46'),
  'f75e4162-674a-4f55-bf5c-a88c5037ce46');
 assert.throws(()=>normalizeFolderId('../../politie'));
 assert.throws(()=>normalizeFolderId('builtin-secret'));
});
test('Alleen publieke HTTPS-links kunnen als lesmateriaal opgeslagen worden',()=>{
 assert.equal(resolveDocumentUrl('https://www.youtube.com/watch?v=abc12345678'),
   'https://www.youtube.com/watch?v=abc12345678');
 for(const url of ['javascript:alert(1)','http://example.com','https://localhost/a',
   'https://192.168.0.3','https://user:password@example.com/',
   'https://[::1]','https://example.com:8443','file:///etc/passwd']){
   assert.throws(()=>resolveDocumentUrl(url),url);
 }
});
test('YouTube kan veilig ingesloten worden, overige links blijven extern',()=>{
 assert.equal(safeYouTubeEmbed('https://youtu.be/abcdefghijk'),
   'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
 assert.equal(safeYouTubeEmbed('https://www.youtube.com/watch?v=abcdefghijk'),
   'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
 assert.equal(safeYouTubeEmbed('https://example.org/watch?v=abcdefghijk'),null);
});
test('Folder- en linkroutes houden dienstrechten, logging en servereigendom',()=>{
 const routes=file('src/document-center-routes.js');
 assert.match(routes,/\/api\/document-center\/folders'/);
 assert.match(routes,/\/api\/document-center\/links'/);
 assert.match(routes,/mayWriteDocuments\(req\.documentScopes,dept\)/);
 assert.match(routes,/await validateFolder\(db,item\.department,item\.folderId\)/);
 assert.match(routes,/mayReadDocument\(req\.documentScopes,snap\.data\(\)\)/);
 assert.match(routes,/action:'add_link'/);
 assert.match(routes,/action:'create_folder'/);
 assert.match(routes,/action:'open_link'/);
 assert.match(routes,/owner:'belgiepd'/);
 assert.doesNotMatch(routes,/makePublic\(/);
});
test('Documentencentrum toont toegankelijke mapnavigatie en donkere invoervelden',()=>{
 const ui=file('public/documentencentrum.html');
 assert.match(ui,/id="folderButtons"/);
 assert.match(ui,/id="addFolder"/);
 assert.match(ui,/id="folder"/);
 assert.match(ui,/id="resourceType"/);
 assert.match(ui,/id="linkUrl"/);
 assert.match(ui,/html\[data-bpd-theme="dark"\]/);
 assert.match(ui,/select option/);
 assert.match(ui,/Presenteren \/ bekijken/);
 assert.match(ui,/youtube-nocookie|resource\.embed/);
});
