// Apply visual labels across pages that share the BelgiumPD navigation shell.
// Display-only: no route, identifier, permission or stored personnel data changes.
(function(){
  'use strict';
  const defaultLabels={'Personeelsbeheer':'Personeelslijst',
    'Personeelsbeheer (lijst)':'Personeelslijst',
    'Centraal personeelsbeheer':'Personeelslijst'};
  let labels={...defaultLabels};
  const targets='nav a, nav button, h1, h2, h3, summary, .section-title, .page-title, .path, aside a, .tile h3, .card h3';
  function updateText(element){
    // Exact text-node comparison preserves icons and avoids replacing arbitrary prose.
    if(element.closest('[data-portal-label-editor]'))return;
    for(const node of element.childNodes){
      if(node.nodeType!==3)continue;
      const source=node.nodeValue,trimmed=source.trim();
      if(!trimmed)continue;
      const target=labels[trimmed];
      if(typeof target!=='string'||target===trimmed)continue;
      node.nodeValue=source.replace(trimmed,target);
    }
  }
  function apply(root=document){
    if(root.nodeType===1&&root.matches?.(targets))updateText(root);
    root.querySelectorAll?.(targets).forEach(updateText);
  }
  function begin(){
    apply();
    const observer=new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node.nodeType===1)apply(node);
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    fetch('/api/portal-labels',{cache:'no-store'}).then(r=>r.ok?r.json():null)
      .then(data=>{
        if(data?.labels&&typeof data.labels==='object'){
          labels={...defaultLabels,...data.labels};apply();
        }
      }).catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});
  else begin();
})();