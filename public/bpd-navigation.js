/* BelgiëPD: compacte gedeelde navigatie bovenaan, nooit zwevend over dossiers. */
(function(){
  'use strict';
  if(window.self!==window.top)return; // Geen dubbele navigatie in dossier-iframes.
  const key='bpdPortalNavigationHistoryV1';
  const here=window.location.pathname; // Sla geen Discord-ID's of queryparameters op.
  // Alleen lokale portaalpaden, maximaal 30 bezoeken, alleen in deze browsertab.
  function validPath(path){return typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&!path.includes('\\');}
  function readStack(){
    try{
      const obj=JSON.parse(window.sessionStorage.getItem(key)||'[]');
      if(Array.isArray(obj))return obj.filter(validPath).slice(-30);
    }catch{}
    return [];
  }
  function saveStack(stack){try{window.sessionStorage.setItem(key,JSON.stringify(stack.slice(-30)))}catch{}}
  let stack=readStack();
  if(stack[stack.length-1]!==here){
    if(stack.length>1&&stack[stack.length-2]===here)stack.pop();
    else stack.push(here);
    saveStack(stack);
  }
  function goBack(){
    const current=readStack();
    if(current[current.length-1]===here&&current.length>1){
      current.pop();
      const target=current[current.length-1];
      saveStack(current);
      if(validPath(target)){window.location.assign(target);return;}
    }
    // Referrer is niet altijd beschikbaar op pagina's met no-referrer.
    let samePortal=false;
    try{
      const previous=new URL(document.referrer);
      const now=new URL(window.location.href);
      samePortal=previous.origin===now.origin&&
        (previous.pathname!==now.pathname||previous.search!==now.search);
    }catch{}
    if(samePortal&&window.history.length>1)window.history.back();
    else window.location.assign('/');
  }
  function alreadyHasHome(nav){
    if(!nav)return false;
    return Array.from(nav.querySelectorAll('a[href]')).some(link=>{
      try{
        const dest=new URL(link.getAttribute('href'),window.location.href);
        return dest.origin===window.location.origin&&
          (dest.pathname==='/'||dest.pathname==='/index.html');
      }catch{return false;}
    });
  }
  function addNavigation(){
    if(document.getElementById('bpdGlobalNavigation'))return;
    // De startpagina heeft al een zichtbare hoofdnavigatie.
    if(here==='/'||here==='/index.html')return;
    const headerNav=document.querySelector('header nav');
    const main=document.querySelector('main');
    const container=headerNav||main||document.body;
    const bar=document.createElement('span');
    bar.id='bpdGlobalNavigation';bar.className='bpd-inline-navigation';
    const back=document.createElement('button');
    back.type='button';back.className='bpd-nav-back';back.textContent='← Terug';
    back.setAttribute('aria-label','Terug naar de vorige portaalpagina');
    back.addEventListener('click',goBack);
    bar.append(back);
    // Op o.a. de Personeelslijst staat Dashboard al in het bovenmenu.
    // Toon dus niet opnieuw een tweede knop Home.
    if(!alreadyHasHome(headerNav)){
      const home=document.createElement('a');
      home.href='/';home.className='bpd-nav-home';home.textContent='⌂ Start';
      home.setAttribute('aria-label','Naar de startpagina');
      bar.append(home);
    }
    if(headerNav)headerNav.prepend(bar);
    else container.prepend(bar); // Compact bovenaan, nooit fixed rechtsonder.
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',addNavigation,{once:true});
  else addNavigation();
})();
