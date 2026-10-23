import test from 'node:test';
import assert from 'node:assert/strict';
import {planDossierImport} from '../src/dossier-import-plan.js';
const person={dept:'politie',personId:'123456789012345678'};
const entry={source:'registrations',sourceId:'r1',dept:'politie',discordId:person.personId,type:'observatie',eventDate:'2026-10-20'};
test('maakt veilige verwijzingen zonder dossierwijziging',()=>{
 const result=planDossierImport([entry],[person]);
 assert.equal(result.accepted[0].category,'observaties');
 assert.equal(result.accepted[0].mode,'reference_only');
 assert.equal(result.readOnly,true);
});
test('blokkeert identiteitsconflicten en dubbele bronregistraties',()=>{
 const result=planDossierImport([entry,{...entry}, {...entry,sourceId:'r2',type:'sanctie'}],[person,person]);
 assert.equal(result.accepted.length,0);
 assert.equal(result.review.length,3);
});
test('onbekende categorie komt in controlewachtrij',()=>{
 const result=planDossierImport([{...entry,type:'onbekend'}],[person]);
 assert.equal(result.review[0].reason,'onbekende_categorie');
});
