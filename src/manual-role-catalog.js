// Explicit, service-scoped portal recovery choices, not Discord ranks or operational licences.
// Agentenkader and Basiskader share the low portal tier, but preserve their distinct
// functionId so protected endpoints can continue verifying the real personnel rank.
export const MANUAL_ROLE_CATALOG=Object.freeze({
  politie:Object.freeze([
    {role:'basiskader',functionId:'agentenkader',label:'Politie – Agentenkader (beperkt)'},
    {role:'basiskader',functionId:'basiskader',label:'Politie – Basiskader'},
    {role:'middenkader',functionId:'middenkader',label:'Politie – Middenkader'},
    {role:'officierenkader',functionId:'officierenkader',label:'Politie – Officierenkader'},
    {role:'korpsleiding',functionId:'korpsleiding',label:'Politie – Korpsleiding'}
  ]),
  ambulance:Object.freeze([
    {role:'basiskader',functionId:'ambulance',label:'AZLS – Ambulance'},
    {role:'basiskader',functionId:'verpleegkundige',label:'AZLS – Verpleegkundige'},
    {role:'basiskader',functionId:'arts',label:'AZLS – Arts'},
    {role:'middenkader',functionId:'medisch-instructeur',label:'AZLS – Medisch instructeur (portaalkader)'},
    {role:'officierenkader',functionId:'azls-leiding',label:'AZLS – Ambulanceleiding (portaalkader)'},
    {role:'korpsleiding',functionId:'dir-med',label:'DIR-MED – Directeur Medisch (portaalkader)'}
  ]),
  brandweer:Object.freeze([
    {role:'basiskader',functionId:'brandweer',label:'Brandweer – Basiskader / Stagiair'},
    {role:'middenkader',functionId:'bw-middenkader',label:'Brandweer – Middenkader (OOFF-08 t/m OOFF-15)'},
    {role:'officierenkader',functionId:'bw-leiding',label:'Brandweerleiding (OFF-02 t/m OFF-06)'},
    {role:'korpsleiding',functionId:'zone',label:'ZONE – Zonecommandant'}
  ]),
  depannage:Object.freeze([
    {role:'basiskader',functionId:'lsra',label:'Depannage – LSRA / Depanneur'},
    {role:'basiskader',functionId:'fast',label:'Depannage – F.A.S.T'},
    {role:'korpsleiding',functionId:'awv',label:'AWV/ANWV – Agentschap Wegen en Verkeer (leiding)'}
  ]),
  // Burgerraad remains a special audited council exception; never a general
  // low-rank Bürger role and never a shortcut to service-leadership rights.
  burger:Object.freeze([
    {role:'basiskader',label:'Burger – Burgerraad (dossiers en BIO-begeleiding)'}
  ])
});
// Backwards compatibility: legacy requests have only a role, which is safe
// only where it maps to exactly one catalogue item. New low-tier choices
// require an explicit functionId, so Agentenkader cannot be confused with BK.
export const manualRoleChoice=(dept,role,functionId=null)=>{
  const choices=MANUAL_ROLE_CATALOG[dept]||[];
  if(functionId!=null)return choices.find(item=>
    item.role===role&&item.functionId===functionId)||null;
  const matches=choices.filter(item=>item.role===role);
  return matches.length===1?matches[0]:null;
};
export const manualRoleLabel=(dept,role,functionId=null)=>
  manualRoleChoice(dept,role,functionId)?.label||({
    basiskader:'Basiskader',middenkader:'Middenkader',
    officierenkader:'Officierenkader',korpsleiding:'Korpsleiding'
  }[role]||'Onbekend kader');
