import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDossiers,sortDossiers,fireCallGroup,policeCallGroup,dossierStats,paginateDossiers,filterTimeline,PAGE_SIZE}
  from '../public/dossiercentrum-view.js';
const rows=[
  {dept:'politie',discordId:'111111111111111111',name:'Émile Vermeulen',rank:'Inspecteur',
    call:'P-101',status:'Actief',personnel:true},
  {dept:'ambulance',discordId:'222222222222222222',name:'Andere medewerker',
    rank:'Ambulancier',call:'A-21',status:'In opleiding',personnel:true}
];
test('Only staff within the authorised input is searchable',()=>{
  assert.equal(filterDossiers(rows,{query:'Emile'}).length,1);
  assert.equal(filterDossiers(rows,{query:'  ÉMILE '}).length,1);
  assert.equal(filterDossiers(rows,{query:'P-101'}).length,1);
  assert.equal(filterDossiers(rows,{department:'ambulance'}).length,1);
  assert.equal(filterDossiers(rows,{department:'brandweer'}).length,0);
  assert.equal(filterDossiers(rows,{query:'Inspecteur',department:'ambulance'}).length,0);
  assert.deepEqual(filterDossiers([],{query:'Emile'}),[]);
  assert.equal(filterDossiers([{dept:'politie',personnel:false,name:'Burger'}]).length,0);
});
test('Politiedossiers kunnen op bestaande reeks worden gefilterd binnen de toegelaten dienst',()=>{
  const data=[
    {dept:'politie',name:'Lid A',series:'Reeks 1',personnel:true},
    {dept:'politie',name:'Lid B',series:'R02',personnel:true},
    {dept:'politie',name:'Lid C',series:'3',personnel:true},
    {dept:'politie',name:'Nog niet ingedeeld',series:'',personnel:true},
    {dept:'ambulance',name:'Ambulance',series:'Reeks 1',personnel:true},
    {dept:'politie',name:'Geen dossier',series:'Reeks 1',personnel:false}
  ];
  const names=filters=>filterDossiers(data,filters).map(p=>p.name);
  assert.deepEqual(names({department:'politie',series:'1'}),['Lid A']);
  assert.deepEqual(names({department:'politie',series:'2'}),['Lid B']);
  assert.deepEqual(names({department:'all',series:'3'}),['Lid C']);
  assert.deepEqual(names({department:'ambulance',series:'1'}),[]);
  assert.deepEqual(names({department:'politie',series:'all',query:'Nog'}),['Nog niet ingedeeld']);
  assert.deepEqual(names({department:'politie',series:'4'}),[]);
  assert.equal(names({department:'politie',series:'all'}).length,4);
});
test('Stats never count non-personnel records',()=>{
  assert.deepEqual(dossierStats([...rows,{personnel:false}]),{
    total:2,personnel:2,applications:0,both:0});
});
test('Pagination remains bounded',()=>{
  assert.equal(PAGE_SIZE,25);
  const data=Array.from({length:57},(_,i)=>({id:i}));
  const x=paginateDossiers(data,2);
  assert.deepEqual([x.page,x.pages,x.rows.length,x.rows[0].id],[2,3,25,25]);
  assert.equal(paginateDossiers(data,999).rows.length,7);
});
test('Only staff timeline types remain',()=>{
  const items=[{kind:'personeel'},{kind:'loopbaan'},{kind:'burger'}];
  assert.equal(filterTimeline(items,'personeel').length,1);
  assert.equal(filterTimeline(items,'loopbaan').length,1);
  assert.deepEqual(filterTimeline(items,'all'),items);
  assert.deepEqual(filterTimeline(items,'burger'),items);
});

test('Four dossier sort choices use natural numeric callsigns and alphabetic names',()=>{
  const data=[
    {name:'Zoë',call:'S9',discordId:'1',dept:'politie',personnel:true},
    {name:'Adam',call:'S100',discordId:'2',dept:'politie',personnel:true},
    {name:'Émile',call:'S10',discordId:'3',dept:'politie',personnel:true},
    {name:'Bram',call:'S99',discordId:'4',dept:'politie',personnel:true},
    {name:'Zonder',call:'',discordId:'5',dept:'politie',personnel:true}
  ];
  const pick=(order)=>sortDossiers(data,order).map(d=>d.call||'—');
  assert.deepEqual(pick('callsign-desc'),['S100','S99','S10','S9','—']);
  assert.deepEqual(pick('callsign-asc'),['S9','S10','S99','S100','—']);
  assert.deepEqual(sortDossiers(data,'name-asc').map(d=>d.name),['Adam','Bram','Émile','Zoë','Zonder']);
  assert.deepEqual(sortDossiers(data,'name-desc').map(d=>d.name),['Zonder','Zoë','Émile','Bram','Adam']);
  assert.deepEqual(pick('invalid'),pick('callsign-bpd'));
  assert.equal(data[0].call,'S9','Sorting must not mutate the original input');
});
test('Sorting applies after search and before pagination across full result set',()=>{
  const data=Array.from({length:130},(_,i)=>({
    name:'Medewerker '+(i+1),call:String(i+1),dept:'politie',personnel:true
  }));
  const filtered=filterDossiers(data,{department:'politie'});
  const first=paginateDossiers(sortDossiers(filtered,'callsign-desc'),1,PAGE_SIZE);
  const second=paginateDossiers(sortDossiers(filtered,'callsign-desc'),2,PAGE_SIZE);
  assert.equal(first.total,130);
  assert.equal(first.rows[0].call,'130');
  assert.equal(first.rows[24].call,'106');
  assert.equal(second.rows[0].call,'105');
  assert.equal(second.rows[24].call,'81');
});


test('BelgiumPD call series begin with 900, 910 and 920, descending by hundred-series, with 008 last',()=>{
  const input=['404','008','910','430','800','920','999','700','900','099','001',
    'SANTO-930*','S008','—','815','909','920','606'].map((call,i)=>({
      call,name:'Persoon '+i,discordId:String(i),dept:'politie',personnel:true
    }));
  const calls=sortDossiers(input,'callsign-bpd').map(r=>r.call);
  assert.deepEqual(calls,[
    '900','909','910','920','920','SANTO-930*','999',
    '800','815','700','606','404','430','001','099','—','008','S008'
  ]);
  assert.equal(sortDossiers(input)[0].call,'900');
  assert.equal(sortDossiers(input).at(-1).call,'S008');
  assert.equal(input[0].call,'404','The original array must not be modified');
});
test('BelgiumPD custom roster order sorts the full set before paging',()=>{
  const data=Array.from({length:130},(_,i)=>({
    call:String(900+i%100),name:'Medewerker '+i,discordId:String(i),
    dept:'politie',personnel:true
  }));
  const sorted=sortDossiers(filterDossiers(data,{department:'politie'}),'callsign-bpd');
  assert.equal(paginateDossiers(sorted,1).rows[0].call,'900');
  assert.equal(paginateDossiers(sorted,1).rows.at(-1).call,'912');
  assert.equal(paginateDossiers(sorted,2).rows[0].call,'912');
});

test('Brandweer callsigns follow the official operational spreadsheet hierarchy',()=>{
  const calls=['STAG-21','BWM-25','OOFF-15','OFF-06','BWM-06','OFF-04',
    'OOFF-08','ZONE','BWM-01','STAG-01','OFF-02','OOFF-12',
    'BWM-05','OOFF-13','OFF-05','OFF-03','OFF-01'];
  const records=calls.map((call,i)=>({dept:'brandweer',call,
    name:'Brandweerlid '+i,personnel:true}));
  assert.deepEqual(sortDossiers(records,'callsign-fire').map(x=>x.call),[
    'ZONE','OFF-02','OFF-03','OFF-04','OFF-05','OFF-06',
    'OOFF-08','OOFF-12','OOFF-13','OOFF-15',
    'BWM-01','BWM-05','BWM-06','BWM-25','STAG-01','STAG-21','OFF-01'
  ]);
  assert.equal(fireCallGroup('BMW-06').group,4,'Legacy BMW typo keeps BWM group');
  assert.equal(fireCallGroup('OOFF-07').group,6,'Unexpected call stays in the list');
  assert.equal(records[0].call,'STAG-21','Sorting does not change original data');
});
test('Brandweer roster filter stays independent from Police default sorting',()=>{
 const data=[
  {dept:'brandweer',call:'STAG-02',personnel:true},
  {dept:'politie',call:'910',personnel:true},
  {dept:'brandweer',call:'ZONE',personnel:true},
  {dept:'politie',call:'900',personnel:true}
 ];
 assert.deepEqual(sortDossiers(filterDossiers(data,{department:'brandweer'}),'callsign-fire')
   .map(x=>x.call),['ZONE','STAG-02']);
 assert.deepEqual(sortDossiers(filterDossiers(data,{department:'politie'}),'callsign-bpd')
   .map(x=>x.call),['900','910']);
});

test('Police cadre separators group korpsleiding, officieren-, midden-, basis- en agentenkader',()=>{
 const records=[
  ['530','Eerste Inspecteur van Politie (1INP)'],
  ['920','Aspirant Commissaris van Politie (ACP)'],
  ['008','Beheer'],
  ['700','Hoofdinspecteur van Politie (HINP)'],
  ['900','Eerste Hoofdcommissaris van Politie (1HCP)'],
  ['200','Agent van Politie'],
  ['930','Aspirant Commissaris van Politie (ACP)'],
  ['910','Eerste Commissaris van Politie (1CP)'],
  ['400','Inspecteur van Politie (INP)'],
  ['600','Aspirant Hoofdinspecteur van Politie (AHINP)']
 ].map(([call,rank],i)=>({call,rank,dept:'politie',name:'Lid '+i,personnel:true}));
 const sourceCalls=records.map(r=>r.call);
 const ordered=sortDossiers(records,'callsign-police');
 assert.deepEqual(ordered.map(r=>r.call),[
  '900','910','920','930','600','700','400','530','200','008'
 ]);
 assert.deepEqual(ordered.map(r=>policeCallGroup(r).label),[
  'KORPSLEIDING','KORPSLEIDING','OFFICIERENKADER','OFFICIERENKADER',
  'MIDDENKADER','MIDDENKADER','BASISKADER','BASISKADER',
  'AGENTENKADER','OVERIGE POLITIE / BEHEER'
 ]);
 assert.deepEqual(records.map(r=>r.call),sourceCalls);
});
test('Distinct sort modes preserve fire and police separation',()=>{
 const mixed=[
  {call:'BWM-01',dept:'brandweer',personnel:true},
  {call:'920',rank:'Aspirant Commissaris van Politie (ACP)',dept:'politie',personnel:true},
  {call:'ZONE',dept:'brandweer',personnel:true},
  {call:'900',rank:'Eerste Hoofdcommissaris van Politie',dept:'politie',personnel:true}
 ];
 assert.deepEqual(sortDossiers(filterDossiers(mixed,{department:'politie'}),'callsign-police')
   .map(r=>r.call),['900','920']);
 assert.deepEqual(sortDossiers(filterDossiers(mixed,{department:'brandweer'}),'callsign-fire')
   .map(r=>r.call),['ZONE','BWM-01']);
 assert.equal(sortDossiers(mixed,'callsign-bpd')[0].call,'900');
});
