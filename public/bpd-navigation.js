/* Shared BelgiumPD navigation shell. Links are presentation only:
   every protected page and action continues to enforce SERVER permissions. */
(function(){
  'use strict';
  // One page-independent preference, never tied to an account or a permission.
  const themeKey='bpdPortalThemeV1';
  function storedTheme(){
    try{return window.localStorage?.getItem(themeKey)==='dark'?'dark':'light'}
    catch{return 'light'}
  }
  let currentTheme=storedTheme();
  function applyTheme(value,persist=false){
    currentTheme=value==='dark'?'dark':'light';
    document.documentElement?.setAttribute('data-bpd-theme',currentTheme);
    if(persist)try{window.localStorage?.setItem(themeKey,currentTheme)}catch{}
    document.querySelectorAll?.('.bpd-theme-toggle').forEach(button=>{
      setThemeButtonIcon(button);
      button.setAttribute('aria-label',
        currentTheme==='dark'?'Overschakelen naar licht thema':'Overschakelen naar donker thema');
      button.setAttribute('aria-pressed',String(currentTheme==='dark'));
      button.title=button.getAttribute('aria-label');
    });
  }
  function makeThemeToggle(){
    const button=document.createElement('button');
    button.className='bpd-theme-toggle';button.type='button';
    setThemeButtonIcon(button);
    button.setAttribute('aria-label',currentTheme==='dark'?
      'Overschakelen naar licht thema':'Overschakelen naar donker thema');
    button.setAttribute('aria-pressed',String(currentTheme==='dark'));
    button.addEventListener('click',()=>applyTheme(currentTheme==='dark'?'light':'dark',true));
    return button;
  }
  // Initial theme is applied after the SVG icon helper definitions.
  // Purely cosmetic TEST reference skin (not on MAIN).
  document.documentElement.classList.add('bpd-reference-ui');
  if(!document.getElementById('bpdReferenceDashboardStyles')){
    const reference=document.createElement('link');
    reference.id='bpdReferenceDashboardStyles';reference.rel='stylesheet';
    reference.href='/bpd-reference-dashboard.css';
    document.head.append(reference);
  }
  // One shared adaptive layer for all portal pages, including embedded
  // personnel viewers. Layout only; the TO board keeps its fixed controls.
  const adaptiveFile=window.location.pathname.split('/').pop()||'index.html';
  const adaptivePage=/^[a-z0-9-]+[.]html$/.test(adaptiveFile)?
    adaptiveFile.slice(0,-5):'unknown';
  document.documentElement.setAttribute('data-bpd-adaptive-page',adaptivePage);
  if(!document.getElementById('bpdAdaptiveLayoutStyles')){
    const adaptive=document.createElement('link');
    adaptive.id='bpdAdaptiveLayoutStyles';adaptive.rel='stylesheet';
    adaptive.href='/bpd-adaptive-layout.css';
    document.head.append(adaptive);
  }
  // Shared SVG icon assets, loaded on TEST only until reviewed.
  if(!document.getElementById('bpdUiIconStyles')){
    const icons=document.createElement('link');
    icons.id='bpdUiIconStyles';icons.rel='stylesheet';
    icons.href='/bpd-ui-icons.css';document.head.append(icons);
  }
  // Display-only DD/MM/YYYY formatting for all services, including embedded views.
  // Input values and API payloads remain ISO dates for consistent sorting.
  if(!document.querySelector('script[data-bpd-display-dates]')){
    const dateScript=document.createElement('script');
    dateScript.type='module';dateScript.src='/bpd-display-dates.js';
    dateScript.dataset.bpdDisplayDates='1';
    document.head.append(dateScript);
  }
  window.addEventListener?.('storage',event=>{
    if(event.key===themeKey)applyTheme(event.newValue==='dark'?'dark':'light');
  });
  if(window.self!==window.top)return; // Never duplicate inside embedded dossiers.
  const here=window.location.pathname;
  const key='bpdPortalNavigationHistoryV1';
  function validPath(path){
    return typeof path==='string'&&path.startsWith('/')&&
      !path.startsWith('//')&&!path.includes('\\');
  }
  function readStack(){
    try{
      const data=JSON.parse(window.sessionStorage.getItem(key)||'[]');
      return Array.isArray(data)?data.filter(validPath).slice(-30):[];
    }catch{return []}
  }
  function saveStack(stack){
    try{window.sessionStorage.setItem(key,JSON.stringify(stack.slice(-30)))}catch{}
  }
  const stack=readStack();
  if(stack[stack.length-1]!==here){
    if(stack.length>1&&stack[stack.length-2]===here)stack.pop();
    else stack.push(here);
    saveStack(stack);
  }
  function back(){
    const trail=readStack();
    if(trail[trail.length-1]===here&&trail.length>1){
      trail.pop();const dest=trail[trail.length-1];saveStack(trail);
      if(validPath(dest)){window.location.assign(dest);return}
    }
    try{
      const ref=new URL(document.referrer),current=new URL(window.location.href);
      if(ref.origin===current.origin&&
         (ref.pathname!==current.pathname||ref.search!==current.search)&&
         window.history.length>1){window.history.back();return}
    }catch{}
    window.location.assign('/');
  }
  const portalLabelScript=document.createElement('script');
  portalLabelScript.src='/portal-labels-client.js';
  portalLabelScript.defer=true;
  document.head.append(portalLabelScript);
  const NAV=Object.freeze({
    home:{href:'/',icon:'⌂',label:'Startpagina',short:'Start'},
    personnel:{href:'/personeelsbeheer.html',icon:'♟',label:'Personeelslijst',short:'Personeel'},
    activity:{href:'/activiteitscentrum.html',icon:'◷',label:'Activiteitscentrum',short:'Activiteit'},
    organogram:{href:'/organogram-hierarchie.html',icon:'🌳',label:'Organogram',short:'Organogram'},
    dossiers:{href:'/dossiercentrum.html',icon:'▣',label:'Dossiercentrum',short:'Dossiers'},
    citizen:{href:'/burger-personeelsdossiers.html',icon:'▤',label:'Burgerpersoneelsdossiers',short:'Burgerdossiers'},
    education:{href:'/opleidingscentrum.html',icon:'🎓',label:'Opleidingscentrum',short:'Opleiding'},
    documents:{href:'/documentencentrum.html',icon:'📚',label:'Documentencentrum',short:'Documenten'},
    calendar:{href:'/opleidingskalender.html',icon:'📅',label:'Multidisciplinaire agenda',short:'Agenda'},
    observations:{href:'/registraties.html',icon:'▤',label:'Observaties Basiskader',short:'Observaties'},
    reports:{href:'/weekrapporten.html',icon:'▥',label:'Weekrapporten',short:'Rapporten'},
    to:{href:'/to-dienstbord.html',icon:'◉',label:'TO-dienstbord',short:'TO'},
    leave:{href:'/verlofbeheer.html',icon:'▦',label:'Verlofbeheer',short:'Verlof'},
    admin:{href:'/gebruikersbeheer.html#dienstbeheer',icon:'⚙',label:'Beheer & rollen',short:'Beheer'},
    center:{href:'/beheercentrum.html',icon:'🛠',label:'Beheercentrum',short:'Beheercentrum'},
    notifications:{href:'/meldingen.html',icon:'✉',label:'Meldingen',short:'Meldingen'},
    profile:{href:'/discord-status.html',icon:'♙',label:'Mijn profiel',short:'Profiel'}
  });
  const ICON_ROUTE=Object.freeze({
    '/':'house','/index.html':'house','/personeelsbeheer.html':'users',
    '/personeelslijst.html':'users','/activiteitscentrum.html':'activity',
    '/dossiercentrum.html':'folder-open','/organogram-hierarchie.html':'network',
    '/organogram.html':'network','/rollen-opleidingen.html':'graduation-cap',
    '/opleidingscentrum.html':'graduation-cap','/documentencentrum.html':'book-open',
    '/opleidingskalender.html':'calendar-days','/registraties.html':'clipboard-pen',
    '/weekrapporten.html':'clipboard-list','/to-dienstbord.html':'radio',
    '/vast-roepnummer-aanvragen.html':'hash','/roepnummers.html':'hash',
    '/verlofbeheer.html':'calendar-check','/meldingen.html':'bell',
    '/beheercentrum.html':'wrench','/gebruikersbeheer.html':'shield-check',
    '/discord-status.html':'user-round','/burger-personeelsdossiers.html':'contact',
    '/koppelritten.html':'clipboard-check','/beeldbibliotheek.html':'layers'
  });
  const STATIC_UI_ICONS=Object.freeze([
    ...new Set(Object.values(ICON_ROUTE)),
    'file-text','fire-truck','ambulance','lock-keyhole',
    'sun','moon','menu','x','search'
  ]);
  function iconNameFor(href,label=''){
    let path='';
    try{path=new URL(href,window.location.origin).pathname}catch{}
    const text=String(label).toLocaleLowerCase('nl');
    if(path==='/personeelsbeheer.html'&&text.includes('brandweer'))
      return 'fire-truck';
    if(path==='/personeelsbeheer.html'&&text.includes('ambulance'))
      return 'ambulance';
    if(path==='/gebruikersbeheer.html'&&text.includes('gebruikersbeheer'))
      return 'lock-keyhole';
    return ICON_ROUTE[path]||'file-text';
  }
  function svgUiIcon(name){
    const value=STATIC_UI_ICONS.includes(name)?name:'file-text';
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.classList.add('bpd-svg-icon');
    icon.setAttribute('viewBox','0 0 24 24');
    icon.setAttribute('aria-hidden','true');
    icon.setAttribute('focusable','false');
    const use=document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href','/assets/bpd-ui-icons.svg#'+value);
    icon.append(use);
    return icon;
  }
  function setThemeButtonIcon(button){
    const label=currentTheme==='dark'?'Licht':'Donker';
    button.replaceChildren(svgUiIcon(currentTheme==='dark'?'sun':'moon'),
      document.createTextNode(' '+label));
  }
  function setMenuIcon(button,open,label=''){
    button.replaceChildren(svgUiIcon(open?'x':'menu'),
      ...(label?[document.createTextNode(' '+label)]:[]));
  }
  applyTheme(currentTheme);
  const SAFE=['home','personnel','organogram','education','calendar','leave','profile'];
  const STAFF=['home','personnel','activity','organogram','dossiers','education','documents','calendar','observations',
    'reports','to','leave','notifications','center','admin'];
  const currentPage=(href)=>{
    const target=new URL(href,window.location.origin).pathname;
    if(target===here)return true;
    return target==='/personeelsbeheer.html'&&here==='/personeelslijst.html';
  };
  function linkFor(item,compact=false){
    const link=document.createElement('a');
    link.href=item.href;
    link.textContent=compact?item.short:item.label;
    if(currentPage(item.href))link.setAttribute('aria-current','page');
    if(!compact){
      const symbol=document.createElement('span');symbol.className='bpd-side-icon';
      symbol.append(svgUiIcon(iconNameFor(item.href,item.label)));
      symbol.setAttribute('aria-hidden','true');
      link.prepend(symbol);
    }
    return link;
  }
  // Search exposes ONLY module links already provided by the verified
  // role-aware navigation, with a fallback to the existing protected roster.
  // It never performs a privileged personnel API call.
  function makeReferenceSearch(source){
    const form=document.createElement('form');
    form.className='bpd-ref-search';form.role='search';
    form.setAttribute('aria-label','Portaalmodules en personeelslijst zoeken');
    const input=document.createElement('input');
    input.type='search';input.autocomplete='off';input.maxLength=110;
    input.placeholder='Zoek module, naam of roepnummer';
    input.setAttribute('aria-label','Zoek module, personeelslid of roepnummer');
    const action=document.createElement('button');
    action.type='submit';action.append(svgUiIcon('search'),document.createTextNode(' Zoek'));
    form.append(input,action);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const q=input.value.trim();
      if(!q)return;
      const value=q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl');
      const allowed=source().filter(item=>item.href&&item.label);
      const exact=allowed.find(item=>
        item.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .toLocaleLowerCase('nl')===value);
      const partial=allowed.find(item=>
        item.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .toLocaleLowerCase('nl').includes(value));
      if(exact||partial){
        window.location.assign((exact||partial).href);
        return;
      }
      // Backend on /personeelslijst.html still independently verifies access.
      window.location.assign('/personeelsbeheer.html?zoek='+encodeURIComponent(q));
    });
    return form;
  }
  function renderQuick(items,bar){
    bar.replaceChildren();
    const current=items.find(item=>currentPage(item.href))||NAV.home;
    const breadcrumb=document.createElement('span');
    breadcrumb.className='bpd-ref-breadcrumb';
    breadcrumb.append(document.createTextNode('BelgiëPD / '));
    const strong=document.createElement('strong');
    strong.textContent=current.label;
    breadcrumb.append(strong);
    const search=makeReferenceSearch(()=>items);
    const shortcuts=document.createElement('details');
    shortcuts.className='bpd-ref-shortcuts';
    const summary=document.createElement('summary');
    summary.textContent='Modules';
    const menu=document.createElement('div');
    menu.className='bpd-ref-shortcuts-menu';
    menu.append(...items.filter(item=>item.href!==current.href)
      .map(item=>linkFor(item,true)));
    shortcuts.append(summary,menu);
    const profile=items.find(item=>item.href===NAV.profile.href);
    bar.append(breadcrumb,search,shortcuts,makeThemeToggle());
    if(profile){
      const link=linkFor(profile,true);
      link.classList.add('bpd-ref-profile');
      link.prepend(svgUiIcon('user-round'));
      bar.append(link);
    }
  }
  function makeQuick(){
    const nav=document.createElement('nav');
    nav.id='bpdQuicknav';nav.setAttribute('aria-label','Snelle portaalnavigatie');
    return nav;
  }
  function homepage(){
    // The homepage already has the correct ROLE-DEPENDENT menu. Reuse the
    // displayed links instead of replacing its special AZLS/ZONE/member menu.
    const sidebar=document.querySelector('.portal > aside');
    const top=document.querySelector('.surface > header.topbar');
    if(!sidebar||!top)return;
    // The home dashboard writes emoji as inline text, while other pages
    // render icons in their own span. Normalize both to one fixed icon column.
    for(const link of sidebar.querySelectorAll('nav a[href]')){
      if(link.querySelector('.bpd-home-side-icon'))continue;
      const raw=String(link.textContent||'').trim();
      const match=/^([^\p{L}\p{N}]+)\s*(.+)$/u.exec(raw);
      if(!match)continue;
      const symbol=match[1].trim(),label=match[2].trim();
      if(!symbol||!label)continue;
      const icon=document.createElement('span');
      icon.className='bpd-home-side-icon';
      icon.append(svgUiIcon(iconNameFor(link.getAttribute('href'),label)));
      icon.setAttribute('aria-hidden','true');
      const text=document.createElement('span');
      text.className='bpd-home-side-label';text.textContent=label;
      link.replaceChildren(icon,text);
    }
    // Consistent SVG module badges, without changing links or service rights.
    for(const card of document.querySelectorAll('.portal a.module[href]')){
      const badge=card.querySelector(':scope > .ico');
      if(!badge)continue;
      badge.replaceChildren(svgUiIcon(iconNameFor(
        card.getAttribute('href'),card.querySelector('h3')?.textContent||'')));
      badge.setAttribute('aria-hidden','true');
    }
    // Split the HOME sidebar into visible headings without creating or
    // authorizing any new links. Home mode selection and service-specific
    // [hidden] flags remain owned by index.html.
    function groupHomeSidebar(){
      const definitions=[
        {name:'Algemeen',paths:['/','/index.html','/discord-status.html','/meldingen.html','/verlofbeheer.html']},
        {name:'Personeel',paths:['/personeelsbeheer.html','/personeelslijst.html',
          '/organogram-hierarchie.html','/organogram.html','/opleidingscentrum.html',
          '/rollen-opleidingen.html','/registraties.html']},
        {name:'Operationeel',paths:['/activiteitscentrum.html','/dossiercentrum.html',
          '/burger-personeelsdossiers.html','/to-dienstbord.html',
          '/opleidingskalender.html','/weekrapporten.html']},
        {name:'Documenten en aanvragen',paths:['/documentencentrum.html',
          '/roepnummers.html','/vast-roepnummer-aanvragen.html']},
        {name:'Beheer',paths:['/beheercentrum.html','/gebruikersbeheer.html']}
      ];
      const resolveGroup=link=>{
        const path=String(link.getAttribute('href')||'').split(/[?#]/,1)[0];
        return definitions.find(def=>def.paths.includes(path))?.name||'Overige';
      };
      for(const menu of sidebar.querySelectorAll('nav')){
        const existing=Array.from(menu.children).filter(item=>
          item.tagName==='A'&&item.hasAttribute('href'));
        if(!existing.length)continue;
        const groups=new Map(definitions.map(def=>[def.name,[]]));
        groups.set('Overige',[]);
        for(const item of existing)groups.get(resolveGroup(item)).push(item);
        const output=document.createDocumentFragment();
        const headings=[];
        for(const [name,links] of groups){
          if(!links.length)continue;
          const heading=document.createElement('span');
          heading.className='bpd-ref-side-heading';
          heading.textContent=name;
          heading.setAttribute('role','heading');
          heading.setAttribute('aria-level','3');
          output.append(heading,...links);
          headings.push([heading,links]);
        }
        menu.append(output); // existing anchors are moved, not recreated
        const refresh=()=>{
          for(const [heading,links] of headings){
            // Hidden links must never leave an empty misleading heading.
            heading.hidden=!links.some(link=>!link.hidden);
          }
        };
        new MutationObserver(records=>{
          if(records.some(record=>record.target===menu||
            record.target.tagName==='A'))refresh();
        }).observe(menu,{subtree:true,attributes:true,attributeFilter:['hidden']});
        refresh();
      }
    }
    groupHomeSidebar();
    // A second, horizontally scrolling quick-navigation duplicated the
    // role-aware menu. Keep the theme switch, but use a compact drawer for
    // widths where the normal sidebar no longer fits.
    const actions=top.querySelector('.topbar-actions')||top;
    const theme=makeThemeToggle();
    theme.id='homeThemeToggle';
    actions.prepend(theme);
    const search=makeReferenceSearch(()=>[...sidebar.querySelectorAll('nav:not([hidden]) a[href]')]
      .filter(a=>!a.closest('[hidden]')&&a.offsetParent!==null)
      .map(a=>({href:a.getAttribute('href'),label:String(a.textContent||'').trim()
        .replace(/^[^\p{L}\p{N}]+/u,'').trim()})));
    search.classList.add('bpd-ref-home-search');
    actions.prepend(search);
    const portal=sidebar.closest('.portal');
    sidebar.id='homeRoleSidebar';
    const toggle=document.createElement('button');
    toggle.type='button';toggle.id='homeMenuToggle';
    setMenuIcon(toggle,false,'Menu');
    toggle.setAttribute('aria-label','Hoofdmenu openen');
    toggle.setAttribute('aria-controls','homeRoleSidebar');
    toggle.setAttribute('aria-expanded','false');
    actions.prepend(toggle);
    const closeButton=document.createElement('button');
    closeButton.type='button';closeButton.id='homeMenuClose';
    setMenuIcon(closeButton,true,'Sluiten');
    closeButton.setAttribute('aria-label','Hoofdmenu sluiten');
    sidebar.prepend(closeButton);
    const scrim=document.createElement('button');
    scrim.type='button';scrim.className='bpd-home-menu-scrim';
    scrim.setAttribute('aria-label','Menu sluiten');
    portal.prepend(scrim);
    function closeMenu(){
      portal.classList.remove('bpd-home-menu-open');
      toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-label','Hoofdmenu openen');
    }
    toggle.addEventListener('click',()=>{
      const open=portal.classList.toggle('bpd-home-menu-open');
      toggle.setAttribute('aria-expanded',String(open));
      toggle.setAttribute('aria-label',open?'Hoofdmenu sluiten':'Hoofdmenu openen');
    });
    closeButton.addEventListener('click',()=>{
      closeMenu();toggle.focus();
    });
    scrim.addEventListener('click',closeMenu);
    sidebar.addEventListener('click',event=>{
      if(event.target.closest('a[href]'))closeMenu();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&portal.classList.contains('bpd-home-menu-open')){
        closeMenu();toggle.focus();
      }
    });
    const compactViewport=window.matchMedia('(max-width:1280px)');
    const memberView=document.getElementById('memberDashboard');
    function syncMenu(){
      const needsDrawer=compactViewport.matches||memberView?.hidden===false;
      portal.classList.toggle('bpd-home-nav-drawer',Boolean(needsDrawer));
      if(!needsDrawer)closeMenu();
    }
    if(compactViewport.addEventListener)
      compactViewport.addEventListener('change',syncMenu);
    else compactViewport.addListener(syncMenu);
    if(memberView)new MutationObserver(syncMenu).observe(memberView,{
      attributes:true,attributeFilter:['hidden']
    });
    syncMenu();
  }
  function addSmallBack(){
    const header=document.querySelector('body > header');
    if(!header||document.getElementById('bpdGlobalNavigation'))return;
    const nav=header.querySelector('nav')||header.querySelector('.header-actions')||
      header.querySelector('.actions')||header;
    // A local back link is already a suitable subtle control.
    const hasBack=Array.from(header.querySelectorAll('a[href]'))
      .some(a=>a.textContent.includes('←'));
    if(hasBack)return;
    const holder=document.createElement('span');
    holder.id='bpdGlobalNavigation';holder.className='bpd-inline-navigation';
    const button=document.createElement('button');
    button.type='button';button.className='bpd-nav-back';
    button.textContent='← Terug';button.setAttribute('aria-label','Vorige portaalpagina');
    button.addEventListener('click',back);
    holder.append(button);nav.prepend(holder);
  }
  function shell(){
    if(document.getElementById('bpdSidebar'))return;
    document.body.classList.add('bpd-shell');
    const aside=document.createElement('aside');
    aside.id='bpdSidebar';aside.setAttribute('aria-label','Hoofdnavigatie BelgiëPD');
    const brand=document.createElement('a');brand.className='bpd-brand';
    brand.href='/';brand.setAttribute('aria-label','BelgiëPD startpagina');
    const mark=document.createElement('img');mark.className='bpd-brand-mark';
    mark.src='/belgiepd-logo-compact.svg';mark.alt='';mark.width=42;mark.height=42;
    const brandText=document.createElement('span');brandText.className='bpd-brand-text';
    const title=document.createElement('strong');title.textContent='BelgiëPD';
    const sub=document.createElement('small');sub.textContent='Beheerportaal';
    brandText.append(title,sub);brand.append(mark,brandText);
    const links=document.createElement('nav');
    links.className='bpd-side-links';links.setAttribute('aria-label','Portaalonderdelen');
    const foot=document.createElement('div');foot.className='bpd-side-footer';
    foot.textContent='Onderdelen blijven beveiligd volgens je portaalrechten.';
    aside.append(brand,links,foot);
    document.body.prepend(aside);
    const mobile=document.createElement('button');
    mobile.id='bpdMenuToggle';mobile.type='button';setMenuIcon(mobile,false);
    mobile.setAttribute('aria-label','Hoofdmenu openen');mobile.setAttribute('aria-expanded','false');
    mobile.setAttribute('aria-controls','bpdSidebar');
    function closeMenu(){document.body.classList.remove('bpd-menu-open');
      mobile.setAttribute('aria-expanded','false');setMenuIcon(mobile,false)}
    mobile.addEventListener('click',()=>{
      const open=document.body.classList.toggle('bpd-menu-open');
      mobile.setAttribute('aria-expanded',String(open));
      setMenuIcon(mobile,open);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeMenu();
    });
    document.addEventListener('click',event=>{
      if(document.body.classList.contains('bpd-menu-open')&&
        !aside.contains(event.target)&&event.target!==mobile)closeMenu();
    });
    aside.addEventListener('click',event=>{
      if(event.target.closest('a[href]'))closeMenu();
    });
    document.body.prepend(mobile);
    const top=makeQuick();
    const header=document.querySelector('body > header');
    if(header)header.after(top);
    else(document.querySelector('body > main')||document.body).before(top);
    function show(list){
      const items=list.map(key=>NAV[key]).filter(Boolean);
      // Group only the ALREADY verified links; labels add no authority.
      // No inaccessible module may be constructed from a group heading.
      const groupCatalog=[
        ['Algemeen',['home','notifications','leave','profile']],
        ['Personeel',['personnel','organogram','education','observations','citizen']],
        ['Operationeel',['activity','dossiers','to','calendar','reports']],
        ['Documenten',['documents']],
        ['Beheer',['center','admin']]
      ];
      const grouped=document.createDocumentFragment(),seen=new Set();
      for(const [title,keys] of groupCatalog){
        const available=keys.map(key=>items.find(item=>item.href===NAV[key]?.href))
          .filter(item=>item&&!seen.has(item.href));
        if(!available.length)continue;
        const heading=document.createElement('span');
        heading.className='bpd-ref-side-heading';heading.textContent=title;
        heading.setAttribute('aria-hidden','true');
        grouped.append(heading);
        for(const item of available){grouped.append(linkFor(item));seen.add(item.href)}
      }
      for(const item of items)if(!seen.has(item.href))grouped.append(linkFor(item));
      links.replaceChildren(grouped);
      renderQuick(items,top);
    }
    // Hide privileged links until the CURRENT authenticated user is checked.
    show(['home','personnel','organogram','profile']);
    addSmallBack();
    verifyIdentity(show);
  }

  // Shared, short-lived navigation VIEW only. The Firebase login already persists
  // across same-origin pages; protected APIs keep validating every request.
  // Never persist ID tokens, role documents, dossier contents or access grants.
  const navCacheKey='bpdPortalNavigationViewV1';
  const navCacheTtlMs=20*1000;
  function cachedNavView(uid){
    if(typeof uid!=='string'||!uid)return null;
    try{
      const saved=JSON.parse(window.sessionStorage.getItem(navCacheKey)||'null');
      if(saved?.uid!==uid||!Number.isFinite(saved?.at)||saved.at>Date.now()||
        Date.now()-saved.at>=navCacheTtlMs)return null;
      return saved.view&&typeof saved.view==='object'?saved.view:null;
    }catch{return null}
  }
  function saveNavView(uid,context,member,citizen){
    if(typeof uid!=='string'||!uid||!context)return;
    const view={
      context:{
        dashboardProfile:context.dashboardProfile||null,
        basicObservationCanSubmit:context.basicObservationCanSubmit===true,
        basicObservationCanReview:context.basicObservationCanReview===true,
        ambulanceCanOpenDossier:context.ambulanceCanOpenDossier===true,
        ambulanceReportVerified:context.ambulanceReportVerified===true,
        showAdvancedDashboard:context.showAdvancedDashboard===true,
        technicalCenterVisible:context.technicalCenterVisible===true,
        visible:context.visible===true
      },
      member:{mode:member?.mode||null,canUseSelfService:member?.canUseSelfService===true},
      citizen:{canAccess:citizen?.canAccess===true}
    };
    try{window.sessionStorage.setItem(navCacheKey,JSON.stringify({uid,at:Date.now(),view}))}
    catch{/* Private browsing or disabled storage: use the ordinary API flow. */}
  }
  function clearNavView(){
    try{window.sessionStorage.removeItem(navCacheKey)}catch{}
  }
  async function verifyIdentity(show){
    // Do not initialize Firebase here: most existing pages initialize their
    // own app. Only subscribe to the app once their own login module exists.
    try{
      const firebase=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
      for(let attempts=0;!firebase.getApps().length&&attempts<22;attempts++)
        await new Promise(resolve=>setTimeout(resolve,350));
      const apps=firebase.getApps();
      if(!apps.length)return;
      const authSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
      let request=0;
      authSdk.onAuthStateChanged(authSdk.getAuth(apps[0]),async user=>{
        const turn=++request;
        document.getElementById('bpdCitizenDossiersLink')?.remove();
        if(!user){clearNavView();show(['home','personnel','organogram','profile']);return}
        try{
          const token=await user.getIdToken();
          const saved=cachedNavView(user.uid);
          let context,member,citizen;
          if(saved){
            ({context,member,citizen}=saved);
          }else{
            [context,member,citizen]=await Promise.all([
              fetch('/api/dashboard/admin-visibility',{cache:'no-store',
                headers:{Authorization:'Bearer '+token}}).then(r=>r.ok?r.json():null),
              fetch('/api/member/dashboard',{cache:'no-store',
                headers:{Authorization:'Bearer '+token}}).then(r=>r.ok?r.json():null),
              fetch('/api/citizen-staff/access',{cache:'no-store',
                headers:{Authorization:'Bearer '+token}}).then(r=>r.ok?r.json():null)
            ]);
            if(turn===request)saveNavView(user.uid,context,member,citizen);
          }
          if(turn!==request)return;
          const citizenGranted=citizen?.canAccess===true;
          const showVerified=pages=>{
            const visible=[...pages];
            if(citizenGranted){
              const dossierIndex=visible.indexOf('dossiers');
              visible.splice(dossierIndex>=0?dossierIndex+1:visible.length,0,'citizen');
            }
            show(visible);
          };
          if(citizenGranted&&here==='/dossiercentrum.html'){
            const nav=document.querySelector('body > header nav');
            if(nav){const link=document.createElement('a');
              link.id='bpdCitizenDossiersLink';link.href='/burger-personeelsdossiers.html';
              link.textContent='Burgerdossiers';nav.insertBefore(link,nav.querySelector('#login'));
            }
          }
          const policeObservations=context?.basicObservationCanSubmit===true||
            context?.basicObservationCanReview===true;
          if(context?.dashboardProfile==='brandweer-zone'){
            const pages=['home','personnel','activity','organogram','dossiers','education','documents','calendar','reports','leave','notifications'];
            if(policeObservations)pages.push('observations');
            showVerified(pages);return;
          }
          if(context?.dashboardProfile==='ambulance-azls'){
            const pages=['home','personnel','organogram'];
            if(context.ambulanceCanOpenDossier===true)pages.push('dossiers','activity');
            pages.push('education','documents','calendar');
            if(context.ambulanceReportVerified===true)pages.push('reports');
            pages.push('leave','notifications');
            if(policeObservations)pages.push('observations');
            showVerified(pages);return;
          }
          if(context?.showAdvancedDashboard===true){
            const pages=STAFF.filter(item=>item==='center'?
              context.technicalCenterVisible===true:item!=='admin'||context.visible===true);
            showVerified(pages);return;
          }
          const basic=[...SAFE];
          if(context||member?.mode==='member')basic.push('documents');
          if(policeObservations)basic.push('observations');
          if(member?.mode==='member'&&member?.canUseSelfService===true)
            basic.push('notifications');
          showVerified(basic);
        }catch{if(turn===request)show(SAFE)}
      });
    }catch{/* Navigation is non-authoritative; keep public links only. */}
  }
  // The action marker is derived only from per-user, server-authorized
  // unread follow-ups. It never reveals case details or grants access.
  // Show an action-required triangle for unread personal notices and
  // outstanding work within each user's existing server-authorized scopes.
  function watchUnreadLeaveReturns(){
    let count=0,unread=0,authenticated=null,requestSeq=0;
    const mark=()=>{
      for(const link of document.querySelectorAll('a[href^="/meldingen.html"]')){
        const existing=link.querySelector('.bpd-action-warning');
        if(!count){existing?.remove();link.removeAttribute('data-action-required');continue}
        link.dataset.actionRequired='true';
        link.title=count+' openstaande melding(en), waarvan '+unread+' ongelezen · actie vereist';
        const badge=existing||document.createElement('span');
        badge.className='bpd-action-warning';
        badge.setAttribute('aria-label',count+' actie vereist; '+unread+' ongelezen');
        badge.textContent='⚠ '+count;
        if(!existing)link.append(badge);
      }
    };
    const poll=async()=>{
      if(!authenticated)return;
      const seq=++requestSeq;
      try{
        const token=await authenticated.getIdToken();
        const paths=['/api/activity-return/checks','/api/leave/requests',
          '/api/leave/series-notifications','/api/training-requests',
          '/api/personnel-return-review','/api/management/pings/mine'];
        const responses=await Promise.all(paths.map(async path=>{
          try{
            const response=await fetch(path,{cache:'no-store',
             headers:{Authorization:'Bearer '+token}});
            return response.ok?await response.json():null;
          }catch{return null}
        }));
        if(seq!==requestSeq||!authenticated||responses.every(x=>!x))return;
        const [returns,leave,series,training,identity,pings]=responses;
        const queue=new Set();let personalUnread=0;
        for(const x of returns?.checks||[]){
          if(!x.readAt){queue.add('return:'+x.id);personalUnread++}
        }
        // An acknowledged but unresolved CHECKING remains an outstanding
        // action. It must not be marked as newly unread.
        for(const x of returns?.checks||[])queue.add('return:'+x.id);
        for(const x of leave?.toReview||[])queue.add('leave:'+x.id);
        for(const x of series?.pending||[])if(!x.readAt){
          queue.add('leave:'+x.id);personalUnread++;
        }
        for(const x of training?.incoming||[])queue.add('training:'+x.id);
        for(const x of identity?.rows||[])queue.add('identity:'+(x.alertId||x.discordId));
        for(const x of pings?.pings||[])if(x.status!=='read'){
          queue.add('ping:'+x.id);personalUnread++;
        }
        count=queue.size;unread=personalUnread;mark();
        setTimeout(mark,500);
      }catch{/* Keep the last authorized marker until next refresh. */}
    };
    (async()=>{
      try{
        const sdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
        for(let attempt=0;!sdk.getApps().length&&attempt<22;attempt++)
          await new Promise(resolve=>setTimeout(resolve,350));
        if(!sdk.getApps().length)return;
        const authSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
        authSdk.onAuthStateChanged(authSdk.getAuth(sdk.getApps()[0]),user=>{
          authenticated=user;count=0;unread=0;mark();if(user)void poll();
        });
        setInterval(()=>{if(authenticated&&document.visibilityState!=='hidden')void poll()},120000);
        window.addEventListener('focus',()=>{if(authenticated)void poll()});
        window.addEventListener('bpd-notifications-refresh',()=>{if(authenticated)void poll()});
      }catch{/* The navigation remains usable when notices are offline. */}
    })();
    const region=document.querySelector('#bpdSidebar .bpd-side-links')||
      document.querySelector('.portal > aside nav');
    if(region){
      let scheduled=false;
      new MutationObserver(()=>{
        if(scheduled)return;scheduled=true;
        queueMicrotask(()=>{scheduled=false;mark()});
      }).observe(region,{childList:true});
    }
  }
  function init(){
    watchUnreadLeaveReturns();
    if(here==='/'||here==='/index.html')homepage();
    else shell();
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

/* BPD adaptive personnel table presentation — 2026-11-04 */
(function initialiseAdaptivePersonnelTables(){
  'use strict';
  // UI-only: no personnel mutations, Firebase writes, permissions or API calls.
  const selector='table.mr-table,table.staff-roster-table';
  const attached=new WeakSet();
  function headings(table){
    const row=table.tHead?.rows[table.tHead.rows.length-1];
    if(!row)return [];
    const names=[];
    for(const th of row.cells){
      const label=(
        th.querySelector('.specialty-col-label')?.textContent||
        th.getAttribute('aria-label')||
        th.getAttribute('title')||
        th.textContent||
        th.querySelector('img[alt]')?.alt||
        ''
      ).replace(/\s+/g,' ').trim();
      for(let index=0;index<Math.max(1,th.colSpan||1);index++)
        names.push(label||'Gegeven');
    }
    return names;
  }
  function annotate(table,labels){
    for(const body of table.tBodies){
      for(const row of body.rows){
        if(row.cells.length===1&&row.cells[0].colSpan>1)continue;
        let column=0;
        for(const cell of row.cells){
          const label=labels[column]||'Gegeven';
          if(cell.dataset.bpdLabel!==label)cell.dataset.bpdLabel=label;
          column+=Math.max(1,cell.colSpan||1);
        }
      }
    }
  }

  /* Personnel-management lists also stay real compact lists on a phone.
     No data is cloned or removed: expandable fields retain live input/button handlers. */
  function prepareManagementMobileList(table){
    if(!table.classList.contains('staff-roster-table')||
       document.documentElement.clientWidth>1024)return;
    const compact=table.classList.contains('roster-police-compact');
    const main=[0,1,compact?2:3,compact?3:4,compact?4:5];
    if(!table.caption?.classList.contains('bpd-mobile-list-heading')){
      const caption=table.createCaption();
      caption.className='bpd-mobile-list-heading';
      for(const label of ['CALL','RANG','NAAM','REEKS','STATUS']){
        const head=document.createElement('span');
        head.textContent=label;caption.append(head);
      }
    }
    for(const body of table.tBodies){
      for(const row of body.rows){
        if(row.cells.length<=main[4]||row.cells.length===1&&row.cells[0].colSpan>1)
          continue;
        row.classList.add('bpd-mobile-list-row');
        for(let i=0;i<main.length;i++){
          const cell=row.cells[main[i]];
          if(cell)cell.classList.add('bpd-mobile-list-cell','bpd-mobile-list-'+
            ['call','rank','name','series','status'][i]);
        }
        const nameCell=row.cells[main[2]];
        if(!nameCell||nameCell.querySelector('.bpd-mobile-list-toggle'))continue;
        const toggle=document.createElement('button');
        toggle.type='button';
        toggle.className='bpd-mobile-list-toggle';
        toggle.textContent='+';
        toggle.setAttribute('aria-expanded','false');
        const name=nameCell.querySelector('strong')?.textContent?.trim()||
          nameCell.textContent.trim()||'personeelslid';
        toggle.setAttribute('aria-label','Toon details van '+name);
        toggle.addEventListener('click',()=>{
          const open=row.classList.toggle('bpd-mobile-list-expanded');
          toggle.textContent=open?'−':'+';
          toggle.setAttribute('aria-expanded',String(open));
          toggle.setAttribute('aria-label',(open?'Verberg':'Toon')+' details van '+name);
        });
        nameCell.append(toggle);
      }
    }
  }

  function adapt(table){
    // The management matrix has many compact, carefully sized columns.
    // Desktop conversion to giant two-column cards makes personnel unusable.
    // Keep the matrix; its existing holder can scroll where unavoidable.
    const desktopAdminMatrix=table.classList.contains('staff-roster-table')&&
      table.closest('#staffManagePanel')&&
      document.documentElement.clientWidth>=900;
    if(desktopAdminMatrix){
      table.classList.remove('bpd-adaptive-cards');
      return;
    }
    const labels=headings(table);
    if(labels.length)annotate(table,labels);
    const host=table.closest('.staff-roster-holder,.mr-scroll,.member-table-wrap,.tablewrap,.scroller')||
      table.parentElement;
    const available=host?.clientWidth||document.documentElement.clientWidth;
    const requiredWidth=Number.parseFloat(table.style.getPropertyValue('--roster-required-width'))||0;
    const required=table.classList.contains('staff-roster-table')?
      Math.max(requiredWidth,table.classList.contains('roster-police-compact')?1250:1160):
      Math.max(1160,390+Math.max(0,labels.length-5)*65);
    table.classList.toggle('bpd-adaptive-cards',available<required+12);
    prepareManagementMobileList(table);
  }
  function attach(table){
    if(attached.has(table))return;
    attached.add(table);
    let pending=false;
    const refresh=()=>{
      if(pending)return;
      pending=true;
      requestAnimationFrame(()=>{pending=false;if(table.isConnected)adapt(table)});
    };
    const changed=new MutationObserver(refresh);
    changed.observe(table,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
    const host=table.closest('.staff-roster-holder,.mr-scroll,.member-table-wrap,.tablewrap,.scroller')||
      table.parentElement;
    if(typeof ResizeObserver!=='undefined'&&host){
      const resized=new ResizeObserver(refresh);
      resized.observe(host);
    }
    window.addEventListener('resize',refresh,{passive:true});
    refresh();
  }
  function init(){
    // Gracefully skip non-browser navigation test stubs and older DOM engines.
    if(typeof document.querySelectorAll!=='function'||typeof MutationObserver!=='function')return;
    for(const table of document.querySelectorAll(selector))attach(table);
    // Some dashboards add their roster after navigation was initialized.
    const arrivals=new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node.nodeType!==1)continue;
          if(node.matches?.(selector)||node.querySelector?.(selector)){
            for(const table of document.querySelectorAll(selector))attach(table);
            return;
          }
        }
      }
    });
    arrivals.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
