import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Authenticated scope middleware guards every service-dossier data entry point',()=>{
 const server=read('src/server.js');
 assert.ok(server.includes('req.bpd.dossierAllowedDepartments=deriveServiceDossierDepartments'));
 assert.ok(server.includes("db.collection('bpd_board_appointments').doc(id).get()"));
 assert.ok(server.includes("db.collection('bpd_discord_auth').doc(id).get()"));
 assert.ok(server.includes('const roster=snapshot.stale?[]:snapshot.data'));
 for(const installer of [
  'installDossierCenterRoutes(app,{requireUser:requireDossierUser,getSnapshot})',
  'installStaffDossierRoutes(app,{requireUser:requireDossierUser,getSnapshot})',
  'installRegistrationRoutes(app,{requireUser:requireDossierUser,getSnapshot})',
  'installManagementRoutes(app,{requireUser:requireDossierUser,getSnapshot})',
  'installSpecializationRoutes(app,{requireUser:requireDossierUser,getSnapshot})'
 ])assert.ok(server.includes(installer),'Missing scope: '+installer);
 assert.ok(server.includes('installPersonnelEditorRoutes(app,{requireUser,requireDossierUser,getSnapshot})'));
});
test('Direct dossier URLs require service-specific rights',()=>{
 const center=read('src/dossier-center-policy.js');
 const staff=read('src/staff-dossier-policy.js');
 const cases=read('src/management-routes.js');
 const entries=read('src/registration-routes.js');
 const history=read('src/personnel-editor-routes.js');
 const specialist=read('src/specialization-routes.js');
 assert.ok(center.includes('canReadServiceDossier(actor,dept)'));
 assert.ok(staff.includes('canReadServiceDossier(actor,staff.dept)'));
 assert.ok(cases.includes("if(!canReadServiceDossier(req.bpd,dept))return res.status(403)"));
 assert.ok(entries.includes("if(!canReadServiceDossier(req.bpd,dept))return res.status(403)"));
 assert.ok(history.includes("app.get('/api/personnel/:dept/:discordId/history',requireDossierUser"));
 assert.ok(specialist.includes("if(!canReadServiceDossier(req.bpd,dept))throw failure(403"));
 assert.ok(cases.includes("if(!canReadServiceDossier(req.bpd,report.dept))return {status:403"));
});
test('Board does not receive modification rights solely by obtaining all-service read access',()=>{
 const cases=read('src/management-routes.js');
 const staff=read('src/staff-dossier-policy.js');
 assert.ok(cases.includes('!mayWriteManagement(req.bpd,dept,type)'));
 assert.ok(cases.includes('!mayClassifyTest(req.bpd,dept)'));
 assert.ok(staff.includes('&&canEditPersonnel(actor,staff)'));
});
