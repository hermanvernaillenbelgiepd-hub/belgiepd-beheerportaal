// Alleen de weergave: geen wijzigingen aan dossierinhoud of bevoegdheden.
export function installDossierTileCollapse(root){
 if(!root)return 0;let count=0;
 for(const tile of root.querySelectorAll('.landscape-cell[data-sheet-tile]')){
  if(tile.dataset.foldReady==='true')continue;
  const h=[...tile.children].find(x=>x.tagName==='H3');
  if(!h)continue;
  tile.dataset.foldReady='true';tile.dataset.collapsed=String(tile.dataset.sheetTile==='movements');
  const btn=document.createElement('button');btn.type='button';btn.className='dossier-tile-toggle';
  const sync=()=>{const closed=tile.dataset.collapsed==='true';
   btn.textContent=closed?'Openklappen':'Inklappen';
   btn.setAttribute('aria-expanded',String(!closed));
   btn.setAttribute('aria-label',(tile.dataset.sheetTile||'Rubriek')+' '+btn.textContent.toLowerCase());
  };
  btn.onclick=()=>{tile.dataset.collapsed=String(tile.dataset.collapsed!=='true');sync()};
  sync();h.append(btn);count++;
 }
 return count;
}
