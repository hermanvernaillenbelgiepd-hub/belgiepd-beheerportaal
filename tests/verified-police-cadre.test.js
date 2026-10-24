import test from 'node:test';
import assert from 'node:assert/strict';
import {roleSummary} from '../src/role-catalog.js';
import {isPolice9xx,verifiedOfficerCadre} from '../src/verified-police-cadre.js';
import {policeKader} from '../src/normalize.js';

const guild='123456789012345678',now=Date.UTC(2026,9,23,10,0,0);
const member=(roles,verifiedAt=now)=>({guildId:guild,roleIds:roles,verifiedAt});

test('9xx bepaalt alleen de officiers-/korpsgroep; andere reeksen nooit',()=>{
  for(const call of ['900','S901','S-930','999'])assert.equal(isPolice9xx(call),true);
  for(const call of ['800','S850','008','SANTO-930','TEST-950'])
    assert.equal(isPolice9xx(call),false);
  assert.equal(policeKader('Onbekend','S930'),'Officierenkader / Korpsleiding');
  assert.equal(policeKader('Agent','950'),'Officierenkader / Korpsleiding');
});
test('Discord-catalogus maakt Officierenkader en Korpsleiding onderscheiden',()=>{
  const officer='1473474238664020151',corps='1562710901080068229';
  assert.equal(roleSummary([officer]).policeRank,'officierenkader');
  assert.equal(verifiedOfficerCadre(member([officer]),guild,now),'Officierenkader');
  assert.equal(verifiedOfficerCadre(member([corps]),guild,now),'Korpsleiding');
  assert.equal(verifiedOfficerCadre(member([officer,corps]),guild,now),'Korpsleiding');
  assert.equal(verifiedOfficerCadre(member(['1353670078142615592']),guild,now),null);
});
test('Geen statusafleiding uit Discord-naam, verouderde of vreemde servergegevens',()=>{
  const corps='1562710901080068229';
  assert.equal(verifiedOfficerCadre(member(['1335578488664490057']),guild,now),null);
  assert.equal(verifiedOfficerCadre(member([corps],now-25*60*60*1000),guild,now),null);
  assert.equal(verifiedOfficerCadre({...member([corps]),guildId:'223456789012345678'},guild,now),null);
  assert.equal(verifiedOfficerCadre({...member([corps]),verifiedAt:undefined},guild,now),null);
  assert.equal(verifiedOfficerCadre({...member([corps]),roleIds:['Korpsleiding']},guild,now),null);
});
