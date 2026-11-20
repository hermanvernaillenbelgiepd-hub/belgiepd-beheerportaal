// Unified, read-only presentation for already-authorized dossier records.
// The latest five remain in view; the remainder use an accessible disclosure.
import {newestDossierEntries} from './dossier-entry-order.js';
import {dossierPreviewText} from './dossier-entry-preview.js';

export const DOSSIER_RECENT_COUNT=5;

export function renderRecentDossierEntries(root,records,render,{
 empty='Geen registraties gevonden.',limited=false,noun='registraties',sort=true
}={}){
 if(!root||typeof root.replaceChildren!=='function'||
   typeof render!=='function')throw TypeError('Ongeldige dossierlijst');
 const list=sort?newestDossierEntries(records):
   (Array.isArray(records)?records.slice():[]);
 root.replaceChildren();
 if(!list.length){
   const message=document.createElement('p');message.className='overview-no-data';
   message.textContent=empty;root.append(message);
 }else{
   list.slice(0,DOSSIER_RECENT_COUNT).forEach((item,i)=>render(root,item,i));
   if(list.length>DOSSIER_RECENT_COUNT){
     const older=document.createElement('details');older.className='bpd-dossier-older';
     const summary=document.createElement('summary');
     const amount=list.length-DOSSIER_RECENT_COUNT;
     summary.textContent='Toon '+amount+(limited?'+':'')+
       ' oudere '+noun;
     const body=document.createElement('div');body.className='bpd-dossier-older-list';
     list.slice(DOSSIER_RECENT_COUNT).forEach((item,i)=>
       render(body,item,DOSSIER_RECENT_COUNT+i));
     older.append(summary,body);
     older.addEventListener('toggle',()=>{
       summary.textContent=(older.open?'Verberg ':'Toon ')+
         amount+(limited?'+':'')+' oudere '+noun;
     });
     root.append(older);
   }
 }
 if(limited){
   const note=document.createElement('p');note.className='overview-no-data bpd-dossier-source-limit';
   note.textContent='De bron kan nog oudere registraties bevatten die niet zijn opgehaald.';
   root.append(note);
 }
 return list.length;
}

// For sections that do not already have a native per-record inspector
// (leave periods, legacy notes, checkride remarks). Never remove actions.
export function attachExpandableDossierText(item,body,text,{
 limit=165,label='Lees volledige tekst'
}={}){
 if(!item||!body)return null;
 const full=String(text??'').trim()||'—';
 if(full.replace(/\s+/g,' ').length<=limit){
   body.textContent=full;return null;
 }
 body.textContent=dossierPreviewText(full,limit);
 const disclosure=document.createElement('details');
 disclosure.className='bpd-dossier-long-text';
 const summary=document.createElement('summary');
 summary.textContent=label;
 const paragraph=document.createElement('p');paragraph.className='bpd-dossier-full-text';
 paragraph.textContent=full;
 disclosure.append(summary,paragraph);
 // Put the expander after the preview, before any existing action buttons.
 body.after(disclosure);
 return disclosure;
}
