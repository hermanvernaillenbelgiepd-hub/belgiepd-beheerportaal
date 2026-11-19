import {formatVisibleDateText} from '/display-date-policy.js';
(function(){
 'use strict';
 const excluded='script,style,textarea,select,option,pre,code,noscript,[contenteditable="true"]';
 const pending=new Set();
 let scheduled=false;
 function eligible(node){
   const parent=node?.parentElement;
   return !!parent&&!parent.closest(excluded);
 }
 function formatTree(root){
   if(root.nodeType===Node.TEXT_NODE){
     if(eligible(root)){
       const result=formatVisibleDateText(root.nodeValue);
       if(result!==root.nodeValue)root.nodeValue=result;
     }
     return;
   }
   if(root.nodeType!==Node.ELEMENT_NODE||root.matches(excluded)||
      !/\d{4}-\d{2}-\d{2}/.test(root.textContent||''))return;
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){
     const node=walker.currentNode;
     if(eligible(node)){
       const result=formatVisibleDateText(node.nodeValue);
       if(result!==node.nodeValue)node.nodeValue=result;
     }
   }
 }
 function queue(node){
   pending.add(node);
   if(scheduled)return;
   scheduled=true;
   queueMicrotask(()=>{
     scheduled=false;
     const nodes=[...pending];pending.clear();
     for(const item of nodes)if(item?.isConnected)formatTree(item);
   });
 }
 function start(){
   // Native date inputs remain real date inputs, never converted to plain text.
   document.documentElement.lang='nl-BE';
   queue(document.body);
   const watcher=new MutationObserver(mutations=>{
     for(const m of mutations){
       if(m.type==='characterData')queue(m.target);
       for(const node of m.addedNodes||[])queue(node);
     }
   });
   watcher.observe(document.body,{childList:true,subtree:true,characterData:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
