import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOfficialStageStatus} from '../public/organogram-official-stage.js';
const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
test('STAGE follows only the official personnel status',()=>{
 for(const s of ['STAGE','Stage','STAG','stagiair','STAGIAIRE','In Stage','  stage  '])assert.equal(isOfficialStageStatus(s),true,s);
 for(const s of ['ACTIEF','50/50','INACTIEF','AANGEMELD','OPLEIDING!','',null,'GESCHORST','STAGE AFGEROND'])assert.equal(isOfficialStageStatus(s),false,String(s));
});
test('organogram ignores legacy manual STAGE and LID display badges',()=>{
 assert.match(page,/import \{isOfficialStageStatus\} from '\/organogram-official-stage\.js'/);
 assert.match(page,/if\(isOfficialStageStatus\(p\.status\)\)flags\.append/);
 assert.doesNotMatch(page,/id="manage-(?:stage|member)"/);
 assert.doesNotMatch(page,/if\(displayLabels\.includes\('(stage|lid)'\)\)/);
 assert.doesNotMatch(page,/flag member/);
 assert.doesNotMatch(page,/Extra weergavelabel/);
});
