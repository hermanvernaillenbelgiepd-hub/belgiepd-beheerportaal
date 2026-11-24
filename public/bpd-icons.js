/* BelgiëPD · interface-emoji vervangen door SVG-iconen uit /assets/bpd-ui-icons.svg
 *
 * Enkel losse interface-emoji in zichtbare tekst worden vervangen. Niet
 * aangeraakt: kleurcirkels (●🔴🟢 = status), rangen, patches, uniformen,
 * invoervelden, <option>, <title> en alles met data-no-icons / data-operational.
 * Werkt ook op later toegevoegde inhoud (MutationObserver). */
(()=>{
  'use strict';
  const MAP={
    '🛡':'shield','🎓':'graduation-cap','📅':'calendar-days','📆':'calendar-days','👥':'users','📁':'folder','📂':'folder-open',
    '⚙':'settings','📋':'clipboard-list','🔒':'lock-keyhole','🔐':'lock-keyhole','🌳':'network','📬':'mail','📧':'mail','✉':'mail',
    '📚':'book-open','📖':'book-open','👤':'user-round','🛠':'wrench','🔧':'wrench','🎨':'palette','🏷':'tag','📻':'radio',
    '🔎':'search','🔍':'search','📝':'file-pen','🔔':'bell','🚒':'fire-truck','🚓':'car','🚑':'ambulance','⚠':'triangle-alert',
    '✓':'check','✔':'check','★':'star','👑':'crown','✎':'pencil','✏':'pencil','📄':'file-text','📊':'activity','ℹ':'info','✕':'x','✖':'x'
  };
  const RE=new RegExp('('+Object.keys(MAP).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')\\uFE0F?','gu');
  const SKIP='SCRIPT,STYLE,TEXTAREA,INPUT,SELECT,OPTION,TITLE,NOSCRIPT,svg,CODE,PRE,[data-no-icons],[data-operational],[contenteditable="true"],.rank,.patch,.uniform,.medal';
  const NS='http://www.w3.org/2000/svg';
  function icon(name){
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('class','bpd-svg-icon bpd-emoji-icon');
    svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    const use=document.createElementNS(NS,'use');
    use.setAttribute('href','/assets/bpd-ui-icons.svg#'+name);
    svg.append(use);
    return svg;
  }
  function convert(node){
    const text=node.nodeValue;
    if(!text||!RE.test(text)){RE.lastIndex=0;return;}
    RE.lastIndex=0;
    const frag=document.createDocumentFragment();
    let last=0,m;
    while((m=RE.exec(text))){
      if(m.index>last)frag.append(text.slice(last,m.index));
      frag.append(icon(MAP[m[1]]));
      last=m.index+m[0].length;
    }
    if(last<text.length)frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  function scan(root){
    if(!root||root.nodeType===8)return;
    if(root.nodeType===3){
      const p=root.parentElement;
      if(p&&!p.closest(SKIP))convert(root);
      return;
    }
    if(root.nodeType!==1||root.closest?.(SKIP))return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode:n=>n.parentElement&&!n.parentElement.closest(SKIP)&&/[^\x00-\x7F]/.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT
    });
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(convert);
  }
  let queue=new Set(),scheduled=false;
  function flush(){
    scheduled=false;
    const items=[...queue];queue=new Set();
    observer.disconnect();
    try{items.forEach(scan);}finally{observer.observe(document.body,{childList:true,subtree:true,characterData:true});}
  }
  const observer=new MutationObserver(records=>{
    for(const r of records){
      if(r.type==='characterData')queue.add(r.target);
      else r.addedNodes.forEach(n=>queue.add(n));
    }
    if(queue.size&&!scheduled){scheduled=true;requestAnimationFrame(flush);}
  });
  function start(){
    if(!document.body)return;
    scan(document.body);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
