/* BelgiëPD: gedeelde Terug/Home-navigatie, zonder dossierdata te bewaren. */
(function(){
  'use strict';
  if(window.self!==window.top)return; // Geen dubbele knoppen in dossier-iframes.
  const key='bpdPortalNavigationHistoryV1';
  const here=window.location.pathname; // Bewaar geen Discord-ID's of andere queryparameters.
  // Alleen paden op hetzelfde portaal, max. 30 bezoeken en deze browsertab.
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
    // Referrer is niet altijd beschikbaar door no-referrer op beveiligde pagina's.
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
  function addNavigation(){
    if(document.getElementById('bpdGlobalNavigation'))return;
    const bar=document.createElement('nav');
    bar.id='bpdGlobalNavigation';bar.className='bpd-global-navigation';
    bar.setAttribute('aria-label','Algemene portaalnavigatie');
    const back=document.createElement('button');
    back.type='button';back.textContent='← Terug';
    back.setAttribute('aria-label','Terug naar de vorige portaalpagina');
    back.addEventListener('click',goBack);
    const home=document.createElement('a');
    home.href='/';home.textContent='⌂ Home';
    home.setAttribute('aria-label','Naar het hoofdmenu');
    bar.append(back,home);document.body.append(bar);
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',addNavigation,{once:true});
  else addNavigation();
})();
