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
      button.textContent=currentTheme==='dark'?'☀ Licht':'☾ Donker';
      button.setAttribute('aria-label',
        currentTheme==='dark'?'Overschakelen naar licht thema':'Overschakelen naar donker thema');
      button.setAttribute('aria-pressed',String(currentTheme==='dark'));
      button.title=button.getAttribute('aria-label');
    });
  }
  function makeThemeToggle(){
    const button=document.createElement('button');
    button.className='bpd-theme-toggle';button.type='button';
    button.textContent=currentTheme==='dark'?'☀ Licht':'☾ Donker';
    button.setAttribute('aria-label',currentTheme==='dark'?
      'Overschakelen naar licht thema':'Overschakelen naar donker thema');
    button.setAttribute('aria-pressed',String(currentTheme==='dark'));
    button.addEventListener('click',()=>applyTheme(currentTheme==='dark'?'light':'dark',true));
    return button;
  }
  applyTheme(currentTheme);
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
  const NAV=Object.freeze({
    home:{href:'/',icon:'⌂',label:'Startpagina',short:'Start'},
    personnel:{href:'/personeelsbeheer.html',icon:'♟',label:'Personeelsbeheer',short:'Personeel'},
    activity:{href:'/activiteitscentrum.html',icon:'◷',label:'Activiteitscentrum',short:'Activiteit'},
    organogram:{href:'/organogram-hierarchie.html',icon:'🌳',label:'Organogram',short:'Organogram'},
    dossiers:{href:'/dossiercentrum.html',icon:'▣',label:'Dossiercentrum',short:'Dossiers'},
    education:{href:'/opleidingscentrum.html',icon:'🎓',label:'Opleidingscentrum',short:'Opleiding'},
    documents:{href:'/documentencentrum.html',icon:'📚',label:'Documentencentrum',short:'Documenten'},
    calendar:{href:'/opleidingskalender.html',icon:'📅',label:'Multidisciplinaire agenda',short:'Agenda'},
    observations:{href:'/registraties.html',icon:'▤',label:'Observaties Basiskader',short:'Observaties'},
    reports:{href:'/weekrapporten.html',icon:'▥',label:'Weekrapporten',short:'Rapporten'},
    to:{href:'/to-dienstbord.html',icon:'◉',label:'TO-dienstbord',short:'TO'},
    leave:{href:'/verlofbeheer.html',icon:'▦',label:'Verlofbeheer',short:'Verlof'},
    admin:{href:'/gebruikersbeheer.html#dienstbeheer',icon:'⚙',label:'Beheer & rollen',short:'Beheer'},
    notifications:{href:'/meldingen.html',icon:'✉',label:'Meldingen',short:'Meldingen'},
    profile:{href:'/discord-status.html',icon:'♙',label:'Mijn profiel',short:'Profiel'}
  });
  const SAFE=['home','personnel','organogram','education','calendar','leave','profile'];
  const STAFF=['home','personnel','activity','organogram','dossiers','education','documents','calendar','observations',
    'reports','to','leave','admin'];
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
      symbol.textContent=item.icon;symbol.setAttribute('aria-hidden','true');
      link.prepend(symbol);
    }
    return link;
  }
  function renderQuick(items,bar){
    bar.replaceChildren();
    for(const item of items)bar.append(linkFor(item,true));
    bar.append(makeThemeToggle());
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
      const match=/^([^\\p{L}\\p{N}]+)\\s*(.+)$/u.exec(raw);
      if(!match)continue;
      const symbol=match[1].trim(),label=match[2].trim();
      if(!symbol||!label)continue;
      const icon=document.createElement('span');
      icon.className='bpd-home-side-icon';icon.textContent=symbol;
      icon.setAttribute('aria-hidden','true');
      const text=document.createElement('span');
      text.className='bpd-home-side-label';text.textContent=label;
      link.replaceChildren(icon,text);
    }
    const quick=makeQuick();
    top.after(quick);
    function update(){
      const active=Array.from(sidebar.querySelectorAll('nav'))
        .find(n=>!n.hidden);
      const links=active?Array.from(active.querySelectorAll('a[href]'))
        .filter(a=>!a.hidden):[];
      quick.replaceChildren();
      for(const original of links){
        // Copy only the safe local portal destination, not any profile ID.
        const href=original.getAttribute('href');
        if(!validPath(href))continue;
        const item=document.createElement('a');item.href=href;
        item.textContent=original.textContent.replace(/^[^\p{L}\p{N}]+/u,'').trim();
        if(new URL(href,window.location.origin).pathname===here)
          item.setAttribute('aria-current','page');
        quick.append(item);
      }
      quick.append(makeThemeToggle());
      quick.hidden=false;
    }
    update();
    const observer=new MutationObserver(update);
    observer.observe(sidebar,{attributes:true,attributeFilter:['hidden'],subtree:true});
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
    mobile.id='bpdMenuToggle';mobile.type='button';mobile.textContent='☰';
    mobile.setAttribute('aria-label','Hoofdmenu openen');mobile.setAttribute('aria-expanded','false');
    mobile.setAttribute('aria-controls','bpdSidebar');
    function closeMenu(){document.body.classList.remove('bpd-menu-open');
      mobile.setAttribute('aria-expanded','false');mobile.textContent='☰'}
    mobile.addEventListener('click',()=>{
      const open=document.body.classList.toggle('bpd-menu-open');
      mobile.setAttribute('aria-expanded',String(open));
      mobile.textContent=open?'×':'☰';
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
      links.replaceChildren(...items.map(item=>linkFor(item)));
      renderQuick(items,top);
    }
    // Hide privileged links until the CURRENT authenticated user is checked.
    show(['home','personnel','organogram','profile']);
    addSmallBack();
    verifyIdentity(show);
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
        if(!user){show(['home','personnel','organogram','profile']);return}
        try{
          const token=await user.getIdToken();
          const [context,member]=await Promise.all([
            fetch('/api/dashboard/admin-visibility',{cache:'no-store',
              headers:{Authorization:'Bearer '+token}}).then(r=>r.ok?r.json():null),
            fetch('/api/member/dashboard',{cache:'no-store',
              headers:{Authorization:'Bearer '+token}}).then(r=>r.ok?r.json():null)
          ]);
          if(turn!==request)return;
          if(context?.dashboardProfile==='brandweer-zone'){
            const pages=['home','personnel','activity','organogram','dossiers','education','documents','calendar','reports','leave','notifications'];
            show(pages);return;
          }
          if(context?.dashboardProfile==='ambulance-azls'){
            const pages=['home','personnel','organogram'];
            if(context.ambulanceCanOpenDossier===true)pages.push('dossiers','activity');
            pages.push('education','documents','calendar');
            if(context.ambulanceReportVerified===true)pages.push('reports');
            pages.push('leave','notifications');
            show(pages);return;
          }
          if(context?.showAdvancedDashboard===true){
            const pages=STAFF.filter(item=>item!=='admin'||context.visible===true);
            show(pages);return;
          }
          const basic=[...SAFE];
          if(context||member?.mode==='member')basic.push('documents');
          if(context?.basicObservationCanSubmit===true)basic.push('observations');
          if(member?.mode==='member'&&member?.canUseSelfService===true)
            basic.push('notifications');
          show(basic);
        }catch{if(turn===request)show(SAFE)}
      });
    }catch{/* Navigation is non-authoritative; keep public links only. */}
  }
  function init(){
    if(here==='/'||here==='/index.html')homepage();
    else shell();
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
