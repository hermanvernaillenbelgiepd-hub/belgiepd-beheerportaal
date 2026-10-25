// Static, non-impersonating read-only preview of intended service dashboards.
// Production APIs remain authoritative and do not accept a simulated actor.
const groups=[
  {id:'politie',name:'Politie',icon:'🛡️'},
  {id:'brandweer',name:'Brandweer',icon:'🚒'},
  {id:'ambulance',name:'Ambulance / AZLS',icon:'🚑'},
  {id:'depannage',name:'Depannage',icon:'🛻'}
];
const item=(key,title,detail,state='yes')=>({key,title,detail,state});
const policeList=item('police','Personeelslijst Politie','Politionele personeelslijst raadplegen; geen dossierinzage');
const ownLeave=item('leave','Mijn verlof','Eigen verlofaanvraag en persoonlijke verlofhistoriek');
const notifications=item('notify','Meldingen','Eigen meldingen en relevante opleidingsaanvragen');
const training=item('training','Opleidingscentrum','Zelf opleidingen aanvragen of toegelaten opleidingsaanvragen opvolgen');
const section=(id,group,label,desc,modules,notes='')=>({id,group,label,desc,modules,notes});
export const TEST_ROLE_PREVIEWS=Object.freeze([
 section('politie-agent','politie','Agentenkader','Basistoegang voor de nieuwere politieleden',[
 policeList,ownLeave,training,notifications,item('call','Vast roepnummer aanvragen','Alleen wanneer nog geen vast roepnummer is toegekend; na de vereiste speeluren en kalenderdagen')]),
 section('politie-basis','politie','Basiskader','Observaties naar lagere politiegraden',[
 policeList,ownLeave,training,notifications,item('observation','Observaties Basiskader','Uitsluitend voor lagere politiegraden')]),
 section('politie-midden','politie','Middenkader','Dienstgebonden dossier- en opleidingsbeheer',[
 policeList,ownLeave,training,notifications,
 item('dossier','Politionele dossiers','Inzage en registraties binnen de toegewezen bevoegdheden'),
 item('reports','Politionele weekrapporten','Uitsluitend Officierenkader of Korpsleiding','no')]),
 section('politie-officier','politie','Officierenkader','Politiepersoneelsbeheer, dossiers en weekrapporten',[
 policeList,ownLeave,training,notifications,item('dossier','Politionele dossiers','Dienstgebonden dossierbeheer'),
 item('reports','Weekrapporten Politie','Lopende en gearchiveerde rapporten'),
 item('admin','Algemeen Gebruikersbeheer','Alleen waar dit volgens de afzonderlijke beheersrechten is toegelaten','conditional')]),
 section('politie-korps','politie','Korpsleiding','Hoogste politionele operationele bevoegdheden',[
 policeList,ownLeave,training,notifications,item('dossier','Politionele dossiers','Korpsleidingbevoegdheden'),
 item('reports','Weekrapporten Politie','Raadplegen, wissen en herstarten volgens rapportregels'),
 item('admin','Gebruikersbeheer','Binnen toegelaten dienst- en bestuursregels','conditional')]),
 section('brandweer-zone','brandweer','ZONE – Zonecommandant','Brandweerleiding: eigen dienst, geen algemene politieadmin',[
 policeList,item('staff','Personeelsbeheer Brandweer','Dienstgebonden personeelsgegevens beheren'),
 item('dossier','Brandweerdossiers','Dienstgebonden observaties, notities en opleidingen'),
 training,item('reports','Brandweerweekrapporten','Lezen na formele ZONE-verificatie'),
 ownLeave,notifications],
 'ZONE vereist een unieke gekoppelde Brandweer-personeelsfiche en verificatie. Geen TO-bord, vaste-roepnummeraanvraag of algemeen Gebruikersbeheer.'),
 section('brandweer-lead','brandweer','Brandweerleiding – OFF','Dienstgebonden Brandweerleiding',[
 policeList,item('staff','Brandweerpersoneel','Personeelsbeheer binnen toegewezen brandweerrechten','conditional'),
 item('dossier','Brandweerdossiers','Afhankelijk van geverifieerde dienstfunctie'),
 training,ownLeave,notifications,item('reports','Weekrapporten Brandweer','Alleen Zonecommandant','no')]),
 section('brandweer-middle','brandweer','Brandweer Middenkader – OOFF','Observatie- en opleidingsbevoegdheden binnen Brandweer',[
 policeList,item('dossier','Brandweerdossiers','Uitsluitend toegestane dossierregistraties','conditional'),
 training,ownLeave,notifications,item('reports','Brandweerweekrapporten','Alleen Zonecommandant','no')]),
 section('brandweer-member','brandweer','Brandweerman/vrouw','Lid van de Brandweer',[
 policeList,training,ownLeave,notifications,
 item('staff','Brandweerpersoneel aanpassen','Geen leidinggevende wijzigingsbevoegdheid','no')]),
 section('ambulance-dirmed','ambulance','DIR-MED – Directeur Medisch','Medische leiding; dienstgebonden toegang',[
 policeList,item('staff','Personeelsbeheer Ambulance','Na verificatie van de leidinggevende functie','conditional'),
 item('dossier','Ambulancedossiers','Na gekoppelde fiche en/of geverifieerde medisch-leidingsrol','conditional'),
 training,item('reports','Ambulanceweekrapporten','Na formele dienstverificatie','conditional'),
 ownLeave,notifications],
 'Een portaalrol op zichzelf is geen bewijs van DIR-MED. Geen TO-bord of algemeen gebruikersbeheer.'),
 section('ambulance-lead','ambulance','AZLS – Ambulanceleiding','Medische leiding met geverifieerde AZLS-toegang',[
 policeList,item('staff','Personeelsbeheer Ambulance','Alleen na geverifieerde AZLS-leiding','conditional'),
 item('dossier','Ambulancedossiers','Na geverifieerde AZLS-rol en gekoppelde personeelsfiche','conditional'),
 training,item('reports','Ambulanceweekrapporten','Geverifieerde AZLS-leiding of DIR-MED','conditional'),
 ownLeave,notifications]),
 section('ambulance-instructor','ambulance','Medisch instructeur','Opleidingsfunctie; niet automatisch ambulanceleiding',[
 policeList,training,notifications,ownLeave,item('staff','Personeelsbeheer Ambulance','Geen automatische personeelsbewerking','no'),
 item('reports','Ambulanceweekrapporten','Alleen geverifieerde leiding','no')]),
 section('ambulance-member','ambulance','Ambulancier','Gewone medewerker Ambulancedienst',[
 policeList,training,ownLeave,notifications,item('dossier','Alle ambulancedossiers','Geen leidinggevende toegang','no')]),
 section('depannage-awv','depannage','AWV / ANWV – Leiding','Agentschap Wegen en Verkeer: verantwoordelijke',[
 policeList,item('staff','Personeelsbeheer Depannage','Dienstgebonden personeelswijzigingen','conditional'),
 item('dossier','Depannagedossiers','Gecontroleerde AWV/ANWV-functie','conditional'),
 training,item('reports','Weekrapporten Depannage','Alleen dienstgebonden AWV/ANWV-leiding','conditional'),
 ownLeave,notifications]),
 section('depannage-fast','depannage','F.A.S.T','Depannagespecialisatie, geen leidinggevende kaderrol',[
 policeList,training,ownLeave,notifications,
 item('reports','Weekrapporten Depannage','Alleen AWV/ANWV-leiding','no')]),
 section('depannage-lsra','depannage','LSRA','Depannagepersoneel, geen leidinggevende kaderrol',[
 policeList,training,ownLeave,notifications,item('dossier','Alle depannagedossiers','Geen automatische leidinggevende rechten','no')])
]);
export const TEST_PREVIEW_GROUPS=Object.freeze(groups);
export const isRolePreviewAuthorized=(actor,projectId)=>
 projectId==='belgiepd-test'&&actor?.portalTechnicalMode===true&&
 actor?.profileTechnicalAvailable===true&&actor?.role==='beheerder'&&
 /^\d{15,22}$/.test(String(actor?.discordId||''))&&
 actor?.uid==='discord:'+actor.discordId;
