/* BelgiumPD: één gedeelde pagina-navigatie, zonder externe afhankelijkheden. */
(function(){
  'use strict';
  if(window.self!==window.top)return; // Geen dubbele knoppen in een ingesloten dossier.
  function addNavigation(){
    if(document.getElementById('bpdGlobalNavigation'))return;
    const bar=document.createElement('nav');
    bar.id='bpdGlobalNavigation';
    bar.className='bpd-global-navigation';
    bar.setAttribute('aria-label','Algemene portaalnavigatie');
    const back=document.createElement('button');
    back.type='button';back.textContent='← Terug';
    back.setAttribute('aria-label','Terug naar de vorige portaalpagina');
    back.addEventListener('click',()=>{
      let samePortal=false;
      try{
        const previous=new URL(document.referrer);
        const now=new URL(window.location.href);
        samePortal=previous.origin===now.origin&&
          (previous.pathname!==now.pathname||previous.search!==now.search);
      }catch{samePortal=false;}
      if(samePortal&&window.history.length>1)window.history.back();
      else window.location.assign('/');
    });
    const home=document.createElement('a');
    home.href='/';home.textContent='⌂ Home';
    home.setAttribute('aria-label','Naar het hoofdmenu');
    bar.append(back,home);
    document.body.append(bar);
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',addNavigation,{once:true});
  else addNavigation();
})();
