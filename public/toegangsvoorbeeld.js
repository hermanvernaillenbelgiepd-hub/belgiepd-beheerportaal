'use strict';
// Read-only visual comparison. No credentials, real identities, authenticated
// requests, writes, or server-side privilege changes are ever attempted.
(function(){
  const roles=[
    {id:'nieuw',label:'Volledig nieuw lid',short:'Nieuw',name:'Nieuw Discord-lid (voorbeeld)',call:'Nog geen CALL',rank:'Nog niet ingedeeld',role:'Geen goedgekeurde portaalrol',status:'Toegang nog niet aangevraagd'},
    {id:'agent',label:'Agentenkader · tijdelijk',short:'Agent temp.',name:'Voorbeeld Agent (tijdelijk)',call:'150',rank:'Agent van politie',role:'Agentenkader · tijdelijk, CALL 101–199',status:'Nog geen vaste 200-reeks'},
    {id:'agentvast',label:'Agentenkader · vast',short:'Agent vast',name:'Voorbeeld Agent (vaste CALL)',call:'250',rank:'Agent van politie',role:'Agentenkader · vast, CALL 200–299',status:'Vast roepnummer na gecontroleerde aanvraag'},
    {id:'basis',label:'Basiskader',short:'Basis',name:'Voorbeeld Inspecteur',call:'300',rank:'Inspecteur van politie',role:'Basiskader · CALL 300–599',status:'Portaaltoegang goedgekeurd'},
    {id:'midden',label:'Middenkader',short:'Midden',name:'Voorbeeld Hoofdinspecteur',call:'700',rank:'Hoofdinspecteur van politie',role:'Middenkader · CALL 600–899',status:'Portaaltoegang goedgekeurd'},
    {id:'officier',label:'Officierenkader',short:'Officier',name:'Voorbeeld Aspirant Commissaris',call:'930',rank:'Aspirant-commissaris van politie',role:'Officierenkader · CALL 900–999; Discord-rol bepaalt rechten',status:'Portaaltoegang goedgekeurd'},
    {id:'korps',label:'Korpsleiding',short:'Korps',name:'Voorbeeld Eerste Hoofdcommissaris',call:'900',rank:'Eerste hoofdcommissaris van politie',role:'Korpsleiding · CALL 900–999; Discord-rol bepaalt rechten',status:'Portaaltoegang goedgekeurd'}
  ];
  // full = authorized for this service, limited = restricted actions,
  // none = no access, extra = separate delegated entitlement required.
  const modules=[
    {id:'home',icon:'⌂',label:'Dashboard',access:['limited','full','full','full','full','full','full'],
     heading:'Startpagina',description:'Het hoofdblad toont links naar de portaalmodules. Zichtbare tegels zijn geen automatische toegang.',
     actions:['Mijn profiel bekijken','Verlofbeheer openen'],explain:'De startpagina toont grotendeels dezelfde modulelinks. Beveiligde API’s bepalen wat daarna werkelijk gelezen of gewijzigd kan worden.'},
    {id:'users',icon:'👥',label:'Gebruikersbeheer',access:['limited','limited','limited','limited','limited','limited','full'],
     heading:'Centraal gebruikersbeheer',description:'Eigen toegang controleren en aanvragen; accounts van anderen beheren volgens de toegestane kadergrenzen.',
     actions:['Mijn toegangsstatus','Aanvragen beoordelen','Officieren beheren'],explain:'Nieuwe leden kunnen hun toegang aanvragen. Officierenkader en Korpsleiding delen de 900-reeks; de geverifieerde Discord-rol bepaalt wie aanvragen mag beoordelen. Een roepnummer kent nooit rechten toe.',
     override:{officier:'limited'},customStatus:{nieuw:'Eigen aanvraag: nog niet ingediend',basis:'Alleen eigen toegangsstatus; geen accountbeheer',midden:'Alleen eigen toegangsstatus; geen accountbeheer',officier:'Beheer aanvragen Basiskader en Middenkader (eigen dienst)',korps:'Beheer aanvragen t/m Officierenkader (eigen dienst)'}},
    {id:'roster',icon:'♙',label:'Personeelslijst',access:['none','none','none','none','full','full','full'],
     heading:'Personeelslijst',description:'Afgeschermde dienstlijst met roepnummer, rang, reeks, status en specialisaties.',
     actions:['Personeelslijst bekijken','Dossier lagere rang openen','Korpsdossier openen'],
     explain:'De bestaande personeelslijst wordt voor bevoegd Middenkader en hoger geopend. Korpsleidingleden in de gedeelde 900-reeks blijven in de lijst zichtbaar; hun volledige dossiers zijn voor onbevoegden afgeschermd.'},
    {id:'dossier',icon:'▣',label:'Personeelsdossiers',access:['none','none','none','none','limited','full','full'],
     heading:'Personeelsfiche',description:'Persoonsgegevens, belangrijke notities, opleiding, observaties, sancties en personeelsbewegingen.',
     actions:['Notitie registreren','Observatie of sanctie','Promotie / personeelsbeweging'],
     explain:'Middenkader mag binnen zijn dienst dossiers van lagere rangen behandelen, met beperktere beheeracties. Officieren en Korpsleiding hebben uitgebreidere bevoegdheden; het Korpsleidingdossier zelf blijft afgeschermd voor lagere kaders.'},
    {id:'observaties',icon:'📝',label:'Observaties',access:['none','limited','limited','limited','full','full','full'],
     heading:'Observaties & sancties',description:'Verslaggeving en personeelsregistraties met logging en controle van de doelrang.',
     actions:['Observatie indienen','Sanctie registreren','Sanctiehistoriek bekijken'],
     explain:'Basiskader kan onder voorwaarden observaties over lagere politierangen indienen zonder inzage in het volledige dossier. Middenkader en hoger hebben eigen dienstgebonden bevoegdheden voor observaties en sancties, afhankelijk van de ernst.'},
    {id:'verlof',icon:'▦',label:'Verlofbeheer',access:['none','limited','limited','limited','full','full','full'],
     heading:'Verlofaanvragen',description:'Verlof aanvragen en, waar bevoegd, aanvragen van collega’s beoordelen.',
     actions:['Eigen verlof aanvragen','Aanvragen van lagere rangen beoordelen'],
     explain:'Eigen verlofaanvragen zijn mogelijk voor goedgekeurde personeelsaccounts. Middenkader mag onder voorwaarden aanvragen van lager personeel tot 30 kalenderdagen beoordelen; Officierenkader en Korpsleiding hebben een hogere beoordelingsbevoegdheid. Extra delegaties blijven afzonderlijk.'},
    {id:'opleidingen',icon:'🎓',label:'Opleidingscentrum',access:['none','extra','extra','extra','full','full','full'],
     heading:'Opleidingscentrum',description:'Opleidingen en resultaten per dienst, met afgeschermde personeelstoegang.',
     actions:['Eigen opleidingen bekijken','Opleiding registreren','Resultaat corrigeren'],
     explain:'Opleidingsregistratie is beschikbaar voor gemachtigd kader en erkende instructeurs. Een gewone Basiskaderrol op zichzelf geeft geen instructeursrecht; een afzonderlijke geverifieerde instructeursrol kan dit wel.'},
    {id:'week',icon:'▥',label:'Weekrapporten',access:['none','none','none','none','full','full','full'],
     heading:'Weekrapporten',description:'Samenvattingen van registraties en personeelsactiviteiten voor bevoegd dienstkader.',
     actions:['Rapport bekijken','Registraties opvolgen'],
     explain:'Rapportage bevat afgeschermde dienstgebonden personeelsinformatie. De bevoegdheid is aan het kader en aan de betreffende dienst gekoppeld.'},
    {id:'beweging',icon:'⇄',label:'Personeelsbewegingen',access:['none','none','none','none','none','full','full'],
     heading:'Personeelsbewegingen',description:'Wijzigingen van rang, functie, roepnummer en andere officiële personeelsgegevens.',
     actions:['Personeelsbeweging registreren','Promotie voorstellen'],
     explain:'Officierenkader en Korpsleiding hebben hiervoor afzonderlijke rechten. Een wijziging moet gelogd worden; een hoog roepnummer alleen geeft nooit het recht een promotie door te voeren.'},
    {id:'to',icon:'📻',label:'TO-dienstbord',access:['extra','extra','extra','extra','extra','extra','extra'],
     heading:'TO-dienstbord',description:'Operationele ploegen, statusknoppen, koppeldiensten en meldingen.',
     actions:['Dienstbord openen','Dienst overnemen'],
     explain:'TO-rechten worden apart toegekend (meekijken of bedienen). Een politierang verleent op zichzelf geen TO-toegang.'},
    {id:'bestuur',icon:'⚙',label:'Bestuur en bijzondere rechten',access:['none','none','none','none','none','extra','extra'],
     heading:'Afzonderlijke machtigingen',description:'Bestuursfunctie, beheertoegang hulpdiensten, technische accounts en uitzonderlijke delegaties.',
     actions:['Bestuursvoordracht bekijken','Dienstenmachtigingen toekennen'],
     explain:'Bestuur is geen politierang. Een afzonderlijk geverifieerde bestuursrol of goedgekeurde aanstelling verleent pas bijbehorende rechten. Officierenkader en Korpsleiding hebben slechts hun uitdrukkelijk toegestane voordracht- of dienstbeheertaken.'}
  ];
  const text=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  const create=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const statuses={full:'● Toegang binnen eigen dienst',limited:'◐ Beperkte toegang of eigen aanvraag',none:'— Geen toegang voor dit profiel',extra:'◇ Alleen na afzonderlijke machtiging'};
  let roleId='nieuw',moduleId='users';
  const getRole=()=>roles.find(p=>p.id===roleId);
  const getModule=()=>modules.find(m=>m.id===moduleId);
  const state=(module,role)=>module.access[roles.indexOf(role)];
  function availableAction(module,role,index){
    const order=roles.indexOf(role);
    if(module.id==='users')return index===0||index===1&&order>=5||index===2&&order===6;
    if(module.id==='home')return true;
    if(module.id==='roster')return order>=4&&(index<2||order===6);
    if(module.id==='dossier')return order>=4&&(index===0||index===1||order>=5);
    if(module.id==='observaties')return order>=1&&(index===0||order>=4&&index===1||order>=5&&index===2);
    if(module.id==='verlof')return order>=1&&(index===0||order>=4);
    if(module.id==='opleidingen')return order>=4&&(index<2||order>=5);
    if(module.id==='week')return order>=4;
    if(module.id==='beweging')return order>=5;
    return false;
  }
  function paintButtons(){
    const root=document.getElementById('roleButtons');root.replaceChildren();
    for(const role of roles){
      const button=create('button','',role.label);
      const note=create('span','',role.call==='Nog geen CALL'?'Nog niet ingedeeld':'CALL '+role.call);
      button.append(note);button.type='button';button.dataset.role=role.id;
      button.setAttribute('aria-pressed',String(role.id===roleId));
      button.addEventListener('click',()=>{roleId=role.id;moduleId=role.id==='nieuw'?'users':'home';draw();});
      root.append(button);
    }
  }
  function paintMenu(){
    const root=document.getElementById('moduleMenu');root.replaceChildren();
    const role=getRole();
    for(const module of modules){
      const level=state(module,role);
      const button=create('button','');
      button.type='button';button.setAttribute('aria-current',String(module.id===moduleId));
      button.append(create('span','sym',module.icon),create('span','',module.label));
      const label={full:'●',limited:'◐',none:'🔒',extra:'◇'}[level];
      button.append(create('span','mark',label));
      button.addEventListener('click',()=>{moduleId=module.id;draw();});
      root.append(button);
    }
  }
  function mockCards(role,module,root){
    const cards=create('div','mock-panel');
    const rows=module.id==='roster'||module.id==='dossier'?
      [['CALL',role.call],['Personeelslid',role.name],['Voorbeeld Korpsleiding','900-reeks · volgens Discord-rol afgeschermd']]:
      module.id==='verlof'?[['Aanvrager',role.name],['Aanvraag','7 tot 14 dagen (voorbeeld)'],['Goedkeuring',roles.indexOf(role)>=2?'Afhankelijk van rol / duur':'Niet bevoegd']]:
      module.id==='users'?[['Account',role.name],['Status',role.status],['Goedgekeurde rol',role.role]]:
      [['Personeel',role.name],['Rang',role.rank],['Dienst','Politie']];
    for(const [label,value] of rows){const card=create('div','');card.append(create('small','',label),create('strong','',value));cards.append(card);}
    root.append(cards);
  }
  function paintWorkspace(){
    const role=getRole(),module=getModule(),level=state(module,role);
    text('sampleName',role.name);text('sampleCall',role.call==='Nog geen CALL'?role.call:'CALL '+role.call);
    text('sampleRole',role.role);
    text('previewPath','Voorbeeld · '+module.label);
    text('previewHeading',module.heading);
    const status=document.getElementById('accessStatus');
    status.dataset.state=level;
    status.textContent=module.customStatus?.[role.id]||statuses[level];
    const root=document.getElementById('moduleContent');root.replaceChildren();
    root.append(create('h3','',module.heading),create('p','',module.description));
    mockCards(role,module,root);
    if(module.id==='users'&&(role.id==='nieuw'||role.id==='agent')){
      root.append(create('div','tips','Vast roepnummer 200–299 aanvragen: vanaf 5 volledige dagen in Discord én 10 speeluren in FiveM, geverifieerd via de bot. Een tijdelijk roepnummer 101–199 is zelfgekozen; de hogere leiding beslist over de vaste toekenning.'));
    }
    if(level==='none')root.append(create('div','tips','Deze sectie is niet beschikbaar voor het geselecteerde profiel. Er worden geen gevoelige dossiers getoond.'));
    if(level==='extra')root.append(create('div','tips','Deze module vereist een afzonderlijk goedgekeurd recht. Een politierang alleen volstaat niet.'));
    const actions=create('div','mock-actions');
    module.actions.forEach((label,index)=>{
      const button=create('button',index===0?'':'secondary',label);
      button.type='button';button.disabled=!availableAction(module,role,index)||level==='none'||level==='extra';
      button.title=button.disabled?'Geen standaardrecht voor dit voorbeeldprofiel':'Alleen voorbeeld — deze actie wijzigt niets';
      button.addEventListener('click',()=>{
        const note=document.getElementById('actionResult');
        if(note)note.textContent='Voorbeeldactie: '+label+' — er is niets opgeslagen of gewijzigd.';
      });
      actions.append(button);
    });
    root.append(actions);
    root.append(create('p','tips','Dit scherm is een interactief voorbeeld; de knoppen voeren geen handelingen uit.'));
    const feedback=create('p','');feedback.id='actionResult';feedback.setAttribute('role','status');root.append(feedback);
    text('moduleExplanation',module.explain);
  }
  function paintMatrix(){
    const h=document.getElementById('matrixHeader'),b=document.getElementById('matrixBody');
    h.replaceChildren();b.replaceChildren();
    const row=create('tr','');row.append(create('th','','Onderdeel / bevoegdheid'));
    for(const role of roles)row.append(create('th','',role.short));
    h.append(row);
    const marks={full:'●',limited:'◐',none:'—',extra:'◇'};
    for(const module of modules){
      const tr=create('tr','');tr.append(create('td','',module.label));
      module.access.forEach(level=>{
        const td=create('td','',marks[level]);td.dataset.access=level;td.title=statuses[level];tr.append(td);
      });
      b.append(tr);
    }
  }
  function draw(){paintButtons();paintMenu();paintWorkspace();}
  paintMatrix();draw();
})();