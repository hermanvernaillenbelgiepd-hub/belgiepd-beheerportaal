import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const server=read('src/server.js'),nav=read('public/bpd-navigation.js'),personnel=read('public/personeelsbeheer.html'),directory=read('public/personeelslijst.html'),home=read('public/index.html'),training=read('public/opleidingscentrum.html'),applicants=read('public/sollicitatiecentrum.html');
test('module search targets canonical personnel entry and keeps query during old redirect',()=>{
 assert.match(nav,/\/personeelsbeheer\.html\?zoek=/);
 assert.match(server,/const search=typeof req\.query\.zoek==='string'/);
 assert.match(server,/encodeURIComponent\(search\)/);
 assert.match(personnel,/bpd-directory-search-filter/);
 assert.match(directory,/event\.origin!==location\.origin/);
 assert.match(directory,/event\.data\?\.type==='bpd-directory-search-filter'/);
 assert.match(directory,/searchDirectory\(\)/);
});
test('central training and application navigation have no broken legacy intake links',()=>{
 assert.doesNotMatch(home,/href="\/rollen-opleidingen\.html"/);
 assert.match(home,/opleidingscentrum\.html\?pane=register/);
 assert.match(training,/pane'\)==='register'/);
 assert.match(home,/href="\/sollicitatiecentrum\.html"/);
 assert.match(training,/href="\/sollicitatiecentrum\.html"/);
 assert.doesNotMatch(read('public/personeel-koppelen.html'),/href="\/solliciteren\.html"/);
 assert.match(applicants,/Sollicitaties zijn momenteel niet geopend/);
 assert.doesNotMatch(applicants,/method="post"|type="submit"/i);
});
test('leave application is centralized, profile remains a historical view',()=>{
 const profile=read('public/discord-status.html');
 assert.match(profile,/\$\('leaveForm'\)\.hidden=true; \/\/ Nieuwe aanvragen/);
 assert.match(profile,/href="\/verlofbeheer\.html">Verlof aanvragen of beheren/);
});
