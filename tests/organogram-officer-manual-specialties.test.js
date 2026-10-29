import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SPECIALTIES,validatePoliceSpecialtyEdit,validatePlacement,manualDisplay,mergePlacement}
 from '../src/organogram-placement-policy.js';
const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const form=(extra={})=>({specialties:['K9','RAGO-IO'],instructorSpecialties:[],
 teacherSpecialties:[],k9Role:'geleider_in_stage',reason:'Handmatige rolcorrectie',...extra});

test('all police specialties are available for the OFF/KL manual editor',()=>{
 const all=SPECIALTIES.politie;
 assert.ok(all.includes('K9')&&all.includes('RAGO')&&all.includes('RAGO-IO'));
 assert.ok(all.includes('MOTARD')&&all.includes('DISP')&&all.includes('RECHERCHE'));
 const full=validatePoliceSpecialtyEdit(form({specialties:[...all]}));
 assert.equal(full.specialties.length,all.length);
 const placement=validatePlacement({boardRole:'none',leadershipTier:'none',displayOrder:0,
  teachingRoles:[],displayLabels:[],specialties:all,instructorSpecialties:[],
  teacherSpecialties:[],reason:'Volledige controleselectie'},'politie');
 assert.equal(placement.specialties.length,all.length);
 const persisted=manualDisplay({status:'active',dept:'politie',...placement},'politie');
 assert.equal(persisted.specialties.length,all.length);
 const result=mergePlacement({dept:'politie',name:'Test',call:'400',rank:'Inspecteur',
  specialties:[]},persisted,{specialties:[],instructorSpecialties:[],
  teacherSpecialties:[],teachingRoles:[]});
 assert.ok(result.specialties.includes('RAGO'));
 assert.ok(!result.specialties.includes('RAGO-IO'));
});
test('K9/manual edits reject unauthorized fields and invalid functions',()=>{
 assert.equal(validatePoliceSpecialtyEdit(form()).k9Role,'geleider_in_stage');
 assert.throws(()=>validatePoliceSpecialtyEdit(form({boardRole:'bestuur'})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({leadershipTier:'Korpsleiding'})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({displayOrder:1})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({specialties:['MOTARD'],k9Role:'geleider'})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({instructorSpecialties:['RAGO-IO']})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({instructorSpecialties:['SIGNALISATIE']})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({specialties:['K9','K9']})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({reason:'kort'})));
 assert.throws(()=>validatePoliceSpecialtyEdit(form({k9Role:'admin'})));
});
test('OFF/KL-only endpoints preserve unrelated technical settings and audit both categories',()=>{
 assert.match(route,/app\.get\('\/api\/organogram\/police-specialties\/admin',requireUser/);
 assert.match(route,/app\.put\('\/api\/organogram\/police-specialties\/:personId',requireUser/);
 const secure=route.split("app.get('/api/organogram/police-specialties/admin'")[1]
  ?.split('// Only technical management receives')[0]||'';
 assert.equal((secure.match(/if\(!canEditK9Display\(req\.bpd\)\)/g)||[]).length,2);
 assert.match(secure,/snapshot\.data\.some\(p=>validRow\(p\)&&p\.dept==='politie'/);
 assert.match(secure,/const preserve=manualDisplay\(old\.data\(\),'politie'\)/);
 assert.match(secure,/boardRole:next\.boardRole/);
 assert.match(secure,/leadershipTier:next\.leadershipTier/);
 assert.match(secure,/displayOrder:next\.displayOrder/);
 assert.match(secure,/action:'police_specialty_display'/);
 assert.match(secure,/action:'k9_display_role'/);
 assert.match(secure,/accessRightsChanged:false/);
 assert.match(route,/app\.post\('\/api\/organogram\/middenkader\/order',requireUser,manager/);
});
test('only authorized users get the hidden manual-specialty UI and badge previews',()=>{
 assert.match(html,/id="police-specialty-toggle" hidden/);
 assert.match(html,/id="police-specialty-editor" class="manager police-specialty-editor" hidden/);
 assert.match(html,/id="manage-toggle" hidden/);
 assert.match(script,/void loadPoliceSpecialtyEditor\(user\.uid\)/);
 assert.match(script,/authFetch\('\/api\/organogram\/police-specialties\/admin'\)/);
 assert.match(script,/if\(data\.canEdit!==true\|\|data\.displayOnly!==true/);
 assert.match(script,/policeSpecialtyPeople=\[\];\$\('police-specialty-toggle'\)\.hidden=true/);
 assert.match(script,/drawBadgePreview\(art,specialty,k9Role\)/);
 assert.match(script,/const k9Role=specialtySet\.has\('K9'\)\?/);
 assert.match(script,/method:'PUT',headers:\{'Content-Type':'application\/json'\}/);
 assert.match(script,/\$\('police-specialty-status'\)\.textContent='Specialisaties en K9-functie opgeslagen en gelogd/);
 assert.match(html,/id="police-specialty-preview-art"/);
 assert.match(html,/id="police-k9-role" disabled/);
});
