import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentScopes,verifiedDocumentRoles,mayReadDocument,
  mayWriteDocuments,mayManageDocuments} from '../src/document-center-policy.js';
import {validateDocumentUpload} from '../src/document-center-routes.js';
const ID='111111111111111111',GUILD='999999999999999999';
const staff=(dept)=>({dept,personId:ID,name:'Demo'});
const actor=(dept,role)=>({uid:'discord:'+ID,discordId:ID,
  role,departments:[dept],departmentRoles:{[dept]:role}});
const roles=(ids)=>({guildId:GUILD,roleIds:ids,verifiedAt:Date.now()});

test('Politie Middenkader beheert eigen dienst maar niet automatisch Brandweer',()=>{
 const s=documentScopes(actor('politie','middenkader'),[staff('politie')]);
 assert.deepEqual(s.write,['politie']);
 assert.deepEqual(s.manage,[]);
 assert.equal(mayManageDocuments(s,'politie'),false);
 assert.deepEqual(s.read,['politie','multidisciplinair']);
 assert.equal(mayWriteDocuments(s,'brandweer'),false);
 assert.equal(mayReadDocument(s,{status:'active',department:'brandweer',
   audience:'instructeurs'}),false);
 assert.equal(mayReadDocument(s,{status:'active',department:'politie',
   audience:'instructeurs'}),true);
});
test('Instructeur met actuele Discord-rol mag alleen lezen, geen upload of leidersdossier',()=>{
 const ins='1309532437952466989';
 const ids=verifiedDocumentRoles(roles([ins]),GUILD);
 const s=documentScopes(actor('brandweer','basiskader'),[staff('brandweer')],ids);
 assert.deepEqual(s.write,[]);
 assert.deepEqual(s.read,['brandweer','multidisciplinair']);
 assert.equal(mayReadDocument(s,{status:'active',department:'brandweer',audience:'leiding'}),false);
 assert.equal(mayReadDocument(s,{status:'archived',department:'brandweer',audience:'instructeurs'}),false);
});
test('Afwijkende server en verlopen rolbewijzen verlenen geen instructeurstoegang',()=>{
 assert.deepEqual(verifiedDocumentRoles(roles(['1309532437952466989']),'888888888888888888'),[]);
 assert.deepEqual(verifiedDocumentRoles({...roles(['1309532437952466989']),
  verifiedAt:Date.now()-25*60*60*1000},GUILD),[]);
 const s=documentScopes(actor('brandweer','basiskader'),[staff('brandweer')],[]);
 assert.deepEqual(s.read,['brandweer','multidisciplinair']);
 assert.equal(mayReadDocument(s,{status:'active',department:'brandweer',audience:'instructeurs'}),false);
});
test('Niet-eenduidige fiches blokkeren schrijven, maar tijdelijke leden zien hun handboeken',()=>{
 const me=actor('politie','middenkader');
 assert.deepEqual(documentScopes(me,[staff('politie'),staff('politie')]).write,[]);
 const temporary=documentScopes(me,[]);
 assert.deepEqual(temporary.write,[]);
 assert.deepEqual(temporary.read,['politie','multidisciplinair']);
 assert.equal(mayReadDocument(temporary,{status:'active',department:'politie',audience:'leden'}),true);
 assert.equal(mayReadDocument(temporary,{status:'active',department:'politie',audience:'leiding'}),false);
});
test('Bevoegd Officierenkader mag alle diensten beheren, maar niet op basis van callsign alleen',()=>{
 const high=actor('politie','officierenkader');
 const s=documentScopes(high,[staff('politie')]);
 assert.ok(s.write.includes('multidisciplinair'));
 assert.ok(s.write.includes('ambulance'));
 assert.ok(s.manage.includes('brandweer'));
 assert.ok(mayManageDocuments(s,'multidisciplinair'));
 const denied=documentScopes(high,[]);
 assert.deepEqual(denied.write,[]);
});
test('Geverifieerd Technisch Beheer behoudt alle rechten',()=>{
 const base={...actor('politie','basiskader'),portalTechnicalMode:true,
   profileTechnicalAvailable:true};
 const s=documentScopes(base,[]);
 assert.equal(s.write.length,6);
 assert.equal(documentScopes({...base,profileTechnicalAvailable:false},[]).write.length,0);
});
test('Dienstleiding mag multidisciplinaire leidingdocumenten lezen',()=>{
 const s=documentScopes(actor('ambulance','middenkader'),[staff('ambulance')]);
 assert.equal(mayReadDocument(s,{status:'active',department:'multidisciplinair',
   audience:'leiding'}),true);
});
test('Documentuploader accepteert geldige PDF en weigert andere extensies en HTML',()=>{
 const data={department:'politie',title:'Radio opleiding',description:'',
   category:'lesmateriaal',audience:'instructeurs',fileName:'radio.pdf',
   base64:Buffer.from('%PDF-1.7\n%%EOF document').toString('base64')};
 assert.equal(validateDocumentUpload(data).mime,'application/pdf');
 assert.throws(()=>validateDocumentUpload({...data,fileName:'script.html'}));
 assert.throws(()=>validateDocumentUpload({...data,fileName:'leeg.docx'}));
 assert.throws(()=>validateDocumentUpload({...data,department:'brandweer',audience:'publiek'}));
});
test('Documentbestanden nooit publiek vrijgegeven en archief verwijdert alleen metadata-status',()=>{
 const routes=readFileSync(new URL('../src/document-center-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const center=readFileSync(new URL('../public/documentencentrum.html',import.meta.url),'utf8');
 const education=readFileSync(new URL('../public/opleidingscentrum.html',import.meta.url),'utf8');
 assert.match(routes,/requireUser,scope/);
 assert.match(routes,/bpd_document_center_audit/);
 assert.match(routes,/status:'archived'/);
 assert.match(routes,/Content-Disposition/);
 assert.doesNotMatch(routes,/makePublic|publicUrl|signedUrl/);
 assert.match(server,/installDocumentCenterRoutes\(app,\{requireUser:requireDossierUser,getSnapshot\}\)/);
 assert.match(center,/documentencentrum|Documentencentrum/i);
 assert.match(education,/href="\/documentencentrum.html"/);
});

test('Een vertrokken uploader blijft niet de eigenaar van zijn documenten',()=>{
 const original={status:'active',department:'politie',audience:'instructeurs',
   uploadedBy:'discord:222222222222222222',owner:'belgiepd'};
 const officer=documentScopes(actor('politie','officierenkader'),[staff('politie')]);
 assert.equal(mayReadDocument(officer,original),true);
 assert.equal(mayManageDocuments(officer,original.department),true);
 const replacement=documentScopes(actor('politie','middenkader'),[staff('politie')]);
 assert.equal(mayReadDocument(replacement,original),true);
 assert.equal(mayManageDocuments(replacement,original.department),false);
 const departure=documentScopes({...actor('politie','middenkader'),
   discordId:'222222222222222222',uid:'discord:222222222222222222'},
   [staff('politie')]);
 assert.equal(departure.manage.length,0);
 assert.equal(departure.write.length,0);
});
test('Bestaande documenten en oude bestandsversies blijven na archiveren bewaard',()=>{
 const routes=readFileSync(new URL('../src/document-center-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/documentencentrum.html',import.meta.url),'utf8');
 assert.match(routes,/const META='bpd_document_center',AUDIT='bpd_document_center_audit',\s+VERSIONS='bpd_document_center_versions'/);
 assert.match(routes,/action:'replace_file'/);
 assert.match(routes,/previousStoragePath:old\.storagePath/);
 assert.match(routes,/expectedVersion/);
 assert.match(routes,/owner:'belgiepd'/);
 assert.match(routes,/mayManageDocuments\(req\.documentScopes,old\.department\)/);
 assert.match(routes,/status:'archived'/);
 assert.doesNotMatch(routes,/oldFile\.delete|storage\(\)\.file\(old\.storagePath\)\.delete/);
 assert.match(page,/Nieuwe bestandsversie/);
 assert.match(page,/canManage\(\)/);
});

test('Handmatig toegekende lesgever krijgt alleen specifieke documenten te zien',()=>{
 const person=actor('brandweer','basiskader');
 const s=documentScopes(person,[staff('brandweer')],[]);
 const entry={status:'active',department:'ambulance',audience:'toegewezen',
   readerIds:[ID]};
 assert.equal(mayReadDocument(s,entry),true);
 assert.equal(mayReadDocument(s,{...entry,readerIds:[]}),false);
 assert.equal(mayWriteDocuments(s,'ambulance'),false);
 assert.equal(mayManageDocuments(s,'ambulance'),false);
});
test('Leesmateriaal voor alle geverifieerde dienstleden, ongeacht callsign',()=>{
 const person=actor('politie','agentenkader');
 const s=documentScopes(person,[]);
 const doc={status:'active',department:'politie',audience:'leden'};
 assert.equal(mayReadDocument(s,doc),true);
 assert.equal(mayReadDocument(s,{...doc,department:'brandweer'}),false);
});
test('PowerPoint en Office-voorvertoning blijft privé in het portaal',()=>{
 const docker=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
 const routes=readFileSync(new URL('../src/document-center-routes.js',import.meta.url),'utf8');
 const preview=readFileSync(new URL('../src/document-preview.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/documentencentrum.html',import.meta.url),'utf8');
 const nav=readFileSync(new URL('../public/bpd-navigation.js',import.meta.url),'utf8');
 const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(docker,/libreoffice-impress/);
 assert.match(preview,/--headless/);
 assert.match(preview,/--convert-to','pdf'/);
 assert.match(routes,/\/api\/document-center\/:id\/preview/);
 assert.match(routes,/mayReadDocument\(req\.documentScopes,snap\.data\(\)\)/);
 assert.match(routes,/previewStoragePath/);
 assert.match(html,/Presenteren \/ bekijken/);
 assert.match(html,/previewDialog/);
 assert.match(nav,/documents:\{href:'\/documentencentrum.html'/);
 assert.match(home,/href="\/documentencentrum.html"/);
});

test('Handboeken groter dan 5 MB kunnen veilig als PDF worden geüpload tot 25 MB',()=>{
 const sample=Buffer.alloc(6*1024*1024,32);
 sample.write('%PDF-',0,'ascii');
 const base={department:'brandweer',title:'Brandweer Handboek',description:'',
   category:'lesmateriaal',audience:'leden',readerIds:[],folderId:null,
   fileName:'brandweer-handboek.pdf'};
 const file=validateDocumentUpload({...base,base64:sample.toString('base64')});
 assert.equal(file.size,sample.length);
 assert.equal(file.mime,'application/pdf');
 assert.equal(file.department,'brandweer');
 const tooLarge=Buffer.alloc(25*1024*1024+1,32);
 tooLarge.write('%PDF-',0,'ascii');
 assert.throws(()=>validateDocumentUpload({...base,base64:tooLarge.toString('base64')}),
   /te grote upload/);
});
test('UI toont bestandsgrootte en opslaglocatie; Express en Office-converter hanteren dezelfde grens',()=>{
 const html=readFileSync(new URL('../public/documentencentrum.html',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../src/document-center-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const office=readFileSync(new URL('../src/document-preview.js',import.meta.url),'utf8');
 assert.match(html,/id="fileInfo"/);
 assert.match(html,/id="destinationHint"/);
 assert.match(html,/Geselecteerd: /);
 assert.match(html,/Selecteer eerst een document/);
 assert.match(html,/Het maximum is/);
 assert.match(html,/Opslaglocatie: /);
 assert.match(backend,/MAX_BYTES=25\*1024\*1024/);
 assert.match(office,/bytes\.length>25\*1024\*1024/);
 assert.match(server,/\/api\/document-center',express\.json\(\{limit:'36mb'/);
});
