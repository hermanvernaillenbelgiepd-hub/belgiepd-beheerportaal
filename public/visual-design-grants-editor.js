// Form is only created inside a verified Technisch Beheer session.
// All permissions are decided again by the API, never by UI visibility.
export function setupVisualDesignGrantsEditor({api,$}){
 const section=document.createElement('section');
 section.id='visualGrantPanel';section.className='config-block';section.hidden=true;
 section.innerHTML=`
  <h3>🔐 Machtigingen: alleen lay-out en vormgeving</h3>
  <p class="muted">Je geeft enkel het recht om vormgeving te wijzigen, geen inzage in personeelsdossiers,
  sancties, Discord-rollen of andere beheerfuncties. Alleen Technisch Beheer mag dit aanpassen.</p>
  <form id="visualGrantForm">
   <div class="form-grid">
    <label>Discord-ID van een goedgekeurde portaalgebruiker
     <input id="visualGrantId" required pattern="[0-9]{15,22}" minlength="15" maxlength="22"
      inputmode="numeric" placeholder="Discord-ID"></label>
    <label>Einddatum (optioneel)
     <input type="date" id="visualGrantExpires"></label>
   </div>
   <label>Motivering (ook bij intrekken verplicht)
    <textarea id="visualGrantReason" rows="2" minlength="10" maxlength="240" required
     placeholder="Waarom wordt dit recht toegekend of ingetrokken?"></textarea></label>
   <div class="buttons"><button type="submit" id="visualGrantSave">Vormgevingsrecht geven</button>
    <button type="button" id="visualGrantReload" class="secondary">Vernieuwen</button></div>
  </form>
  <p id="visualGrantStatus" class="muted" aria-live="polite"></p>
  <div id="visualGrantRows" class="grid"></div>
 `;
 $('visualDesign').append(section);
 let grants=[];
 const status=(s,fail=false)=>{
  const node=$('visualGrantStatus');node.textContent=s;node.classList.toggle('bad',fail);
 };
 const reason=()=>String($('visualGrantReason').value||'').trim();
 const validReason=()=>reason().length>=10&&reason().length<=240;
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function draw(){
  const area=$('visualGrantRows');area.replaceChildren();
  if(!grants.length){area.textContent='Geen aparte machtigingen geregistreerd.';return}
  for(const item of grants){
   const card=document.createElement('div');card.className='tile';
   const who=document.createElement('strong');who.textContent=item.discordId;
   const note=document.createElement('p');
   note.textContent=(item.enabled?(item.expiresOn&&item.expiresOn<today()?'Verlopen':'Actief'):'Ingetrokken')+
    (item.expiresOn?' · geldig tot '+item.expiresOn:' · geen einddatum');
   card.append(who,note);
   if(item.enabled){
    const button=document.createElement('button');
    button.className='secondary';button.type='button';button.textContent='Toegang intrekken';
    button.onclick=async()=>{
     if(!validReason())return status('Vul eerst een motivering van 10 tot 240 tekens in.',true);
     if(!confirm('Alleen vormgevingsrecht van '+item.discordId+' intrekken?'))return;
     button.disabled=true;
     try{
      await api('/api/visual-design/grants/'+encodeURIComponent(item.discordId),'PUT',{
       action:'revoke',reason:reason(),expectedRevision:item.revision
      });
      await load();status('Machtiging ingetrokken en gelogd.');
     }catch(e){status('Intrekken niet gelukt: '+e.message,true);button.disabled=false}
    };
    card.append(button);
   }
   area.append(card);
  }
 }
 async function load(){
  const result=await api('/api/visual-design/grants');
  grants=Array.isArray(result.grants)?result.grants:[];
  section.hidden=false;
  draw();
  status(result.more?'Toont eerste 100 machtigingen; voor meer is een paginering nodig.':
   'Vormgevingsmachtigingen geladen.');
 }
 $('visualGrantForm').onsubmit=async e=>{
  e.preventDefault();
  const id=$('visualGrantId').value.trim();
  if(!/^\d{15,22}$/.test(id)||!validReason())
   return status('Gebruik een geldige Discord-ID en vul de reden in.',true);
  if(!confirm('Alleen vormgevingsrecht toekennen aan '+id+'?'))return;
  $('visualGrantSave').disabled=true;
  try{
   const prior=grants.find(x=>x.discordId===id);
   await api('/api/visual-design/grants/'+encodeURIComponent(id),'PUT',{
    action:'grant',reason:reason(),expiresOn:$('visualGrantExpires').value||null,
    expectedRevision:prior?.revision??0
   });
   await load();status('Vormgevingsrecht toegewezen en gelogd.');
  }catch(e){status('Toegang niet gewijzigd: '+e.message,true)}
  finally{$('visualGrantSave').disabled=false}
 };
 $('visualGrantReload').onclick=()=>void load().catch(e=>status(e.message,true));
 return {load};
}
