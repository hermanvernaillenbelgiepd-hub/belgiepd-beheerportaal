// Explicit per-service *portal cadre recovery* choices. These are not Discord
// roles, specialist qualifications or proof of official service command.
export const MANUAL_ROLE_CATALOG=Object.freeze({
  politie:Object.freeze([
    {role:'middenkader',label:'Politie – Middenkader'},
    {role:'officierenkader',label:'Politie – Officierenkader'},
    {role:'korpsleiding',label:'Politie – Korpsleiding'}
  ]),
  ambulance:Object.freeze([
    {role:'middenkader',label:'AZLS – Medisch instructeur (portaalkader)'},
    {role:'officierenkader',label:'AZLS – Ambulanceleiding (portaalkader)'},
    {role:'korpsleiding',label:'DIR-MED – Directeur Medisch (portaalkader)'}
  ]),
  brandweer:Object.freeze([
    {role:'middenkader',label:'Brandweer – Middenkader (OOFF-08 t/m OOFF-15)'},
    {role:'officierenkader',label:'Brandweerleiding (OFF-02 t/m OFF-06)'},
    {role:'korpsleiding',label:'ZONE – Zonecommandant'}
  ]),
  depannage:Object.freeze([
    {role:'korpsleiding',label:'AWV/ANWV – Agentschap Wegen en Verkeer (leiding)'}
  ]),
  // Burgerraad is a strictly service-local, audited manual council proof,
  // not a higher global portal cadre or a Discord role.
  burger:Object.freeze([
    {role:'basiskader',label:'Burger – Burgerraad (dossiers en BIO-begeleiding)'}
  ])
});
export const manualRoleChoice=(dept,role)=>
  MANUAL_ROLE_CATALOG[dept]?.find(item=>item.role===role)||null;
export const manualRoleLabel=(dept,role)=>
  manualRoleChoice(dept,role)?.label||({
    middenkader:'Middenkader',officierenkader:'Officierenkader',
    korpsleiding:'Korpsleiding'
  }[role]||'Onbekend kader');
