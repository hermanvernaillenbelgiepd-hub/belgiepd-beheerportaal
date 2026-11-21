import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

test('Dossier center browser script parses as JavaScript',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,'inline browser module exists');
  const inline=match[1].replace(/^\s*import\s*\{[\s\S]*?\}\s*from\s*'\/dossiercentrum-view\.js';/,'');
  assert.doesNotThrow(()=>new Script(inline,{filename:'dossiercentrum.html'}));
});
test('Dossier UI renders fetched data as text and cannot grant access',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.ok(html.includes('textContent'));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
  assert.equal(/fetch\([^)]*method:\s*['"]POST/.test(html),false);
});

test('Dossier controls offer authorised filters and one scrollable overview',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  for(const id of ['query','department','series','historyKind','sortOrder','stats'])
    assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
  assert.ok(html.includes("from '/dossiercentrum-view.js'"));
  assert.match(html,/\.scroller\{max-height:560px;overflow-y:auto/);
  assert.doesNotMatch(html,/id="nextPage"|id="previousPage"/);
  assert.equal(html.includes('Open volledige personeelsfiche · observaties & sancties'),false);
  assert.match(html,/frame\.src=r\.dept==='brandweer'\?/);
  assert.ok(html.includes("'/personeelsbeheer.html?'+new URLSearchParams({embed:'1',dept:r.dept,discordId:r.discordId})"));
  assert.equal(html.includes('burgerdossier'),false);
  assert.equal(html.includes('sollicitatiebeheer'),false);
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});


test('The MAIN dossier list shows callsign, grade and status in separate columns',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  const view=readFileSync(new URL('../public/dossiercentrum-view.js',import.meta.url),'utf8');
  assert.match(html,/<th>Naam<\/th><th>Roepnummer<\/th><th id="dossierFunctionColumn">Graad<\/th><th>Dienst<\/th><th>Status<\/th><th>Discord-ID<\/th><th>Actie<\/th>/);
  assert.ok(html.includes("node('span',r.call||'—','dossier-callsign')"));
  assert.match(html,/const rank=node\('span',filters\.department==='depannage'/);
  assert.ok(html.includes("node('span',r.status||'—','dossier-status')"));
  assert.ok(html.includes("cell.colSpan=7"));
  assert.ok(view.includes("[r.name,r.call,r.rank,r.status,r.discordId]"));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});


test('Dossier sorting selector preserves numeric and alphabetical choices and defaults to BPD roster sequence',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.ok(html.includes('id="sortOrder"'));
  for(const option of ['callsign-bpd','callsign-desc','callsign-asc','name-asc','name-desc'])
    assert.ok(html.includes('value="'+option+'"'));
  assert.ok(html.includes('value="callsign-bpd" selected'));
  assert.ok(html.includes("sortDossiers(found,$('sortOrder').value)"));
  assert.ok(html.includes('for(const r of sorted)'));
  assert.doesNotMatch(html,/paginateDossiers\(sorted,page,PAGE_SIZE\)/);
  assert.ok(html.includes("$('sortOrder').onchange=changedFilters"));
  assert.ok(html.includes("$('sortOrder').value='callsign-bpd'"));
  assert.ok(html.includes("function changedFilters(){page=1;render()}"));
});

test('Police series selection follows existing server-authorized department scope',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.match(html,/<select id="series" disabled>/);
  for(const series of ['1','2','3'])assert.ok(html.includes('value="'+series+'">Reeks '+series));
  assert.ok(html.includes('syncSeriesFilter()'));
  assert.ok(html.includes("policeAllowed&&(current==='all'||current==='politie')"));
  assert.ok(html.includes("$('series').value='all';selectDepartment('all')"));
});

test('Beveiligde personeelsfiche opent zonder verdwenen detailLinks-element of diensthistoriek',async()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/\$\('detailLinks'\)/);
  const from=html.indexOf('async function openDossier(r){');
  const to=html.indexOf('async function load(){',from);
  assert.ok(from>0&&to>from);
  const staff={children:[],replaceChildren(){this.children=[]},append(child){this.children.push(child)}};
  const elems={
    detail:{hidden:true,scrollIntoView(){}},
    detailTitle:{textContent:''},detailService:{dataset:{},textContent:''},
    historyKind:{value:''},history:{textContent:''},
    matchWarning:{textContent:''},staff
  };
  const context={
    shown:null,timelineEntries:[],departments:{politie:'Politie'},
    $:id=>{if(!elems[id])throw Error('Ontbrekend element '+id);return elems[id]},
    switchDossierTab:()=>{},renderHistory:()=>{},
    document:{body:{classList:{add:()=>{}}},createElement:tag=>({tagName:tag,style:{}})},
    request:async()=>{throw Error('Geschiedenis tijdelijk niet beschikbaar')},
    URLSearchParams,message:()=>{}
  };
  await new Script(html.slice(from,to)+
    "\\nopenDossier({dept:'politie',discordId:'123456789012345678',name:'seppie',canOpen:true})")
    .runInNewContext(context);
  assert.equal(staff.children.length,1);
  assert.equal(staff.children[0].tagName,'iframe');
  assert.match(staff.children[0].src,/personeelsbeheer\\.html\\?embed=1/);
  assert.match(elems.history.textContent,/Diensthistoriek niet beschikbaar/);
  assert.equal(elems.detail.hidden,false);
});
