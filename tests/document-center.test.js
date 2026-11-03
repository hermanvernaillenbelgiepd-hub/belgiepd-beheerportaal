import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentScopes,verifiedDocumentRoles,mayReadDocument,
  mayWriteDocuments} from '../src/document-center-policy.js';
import {validateDocumentUpload} from '../src/document-center-routes.js';
const ID='111111111111111111',GUILD='999999999999999999';
const staff=(dept)=>({dept,personId:ID,name:'Demo'});
const actor=(dept,role)=>({uid:'discord:'+ID,discordId:ID,
  role,departments:[dept],departmentRoles:{[dept]:role}});
const roles=(ids)=>({guildId:GUILD,roleIds:ids,verifiedAt:Date.now()});

test('Politie Middenkader beheert eigen dienst maar niet automatisch Brandweer',()=>{
 const s=documentScopes(actor('politie','middenkader'),[staff('politie')]);
 assert.deepEqual(s.write,['politie']);
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
 assert.deepEqual(s.read,[]);
});
test('Een niet-eenduidige persoonsfiche geeft geen upload- of leesrechten',()=>{
 const me=actor('politie','middenkader');
 assert.deepEqual(documentScopes(me,[staff('politie'),staff('politie')]).write,[]);
 assert.deepEqual(documentScopes(me,[]).read,[]);
});
test('Bevoegd Officierenkader mag alle diensten beheren, maar niet op basis van callsign alleen',()=>{
 const high=actor('politie','officierenkader');
 const s=documentScopes(high,[staff('politie')]);
 assert.ok(s.write.includes('multidisciplinair'));
 assert.ok(s.write.includes('ambulance'));
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
