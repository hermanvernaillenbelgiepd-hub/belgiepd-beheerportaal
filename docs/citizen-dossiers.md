# Burgerdossiers (BIO, Burger en Burgerraad)

## Afgeschermde dienstmodule

Een afzonderlijke module op `/burgerdossiers.html`, met dezelfde dossierindeling (identiteit, bovenste en onderste registratierij) als de andere hulpdiensten. De **Burgerraad** beheert BIO- en Burgerpersoneelsdossiers op basis van Discord-ID. De oude `/burgerdossier.html` en `/api/citizens` blijven **HTTP 410**, om vroegere open burgerregistraties niet te heractiveren.

Rol-IDs:
- Burgerraad: `1492485336197234728` — alleen deze rol opent/leest/schrijft de module.
- BIO: `1398985105254650007` — burger in opleiding.
- Burger: `1309532438019706966` — volwaardig Burger.

De status komt van een actuele gecontroleerde Discord-rollenweergave of een geverifieerde OAuth-rolsnapshot. Een Burgerrol krijgt voorrang op BIO, zodat beide rollen tijdens een overgang geen dubbele fiches veroorzaken. Het perspectief blijft Burgerdienst; politie-/brandweer-/ambulance-/depannagedossiers of kwalificaties worden niet samengevoegd.

## Beveiligingsgrenzen

- Firebase ID-token met **eigen Discord-login**, geldig voor dezelfde Discord-guild. De server controleert de **Burgerraadrol** bij elke API-oproep op een guild-gebonden rolverificatie van maximaal 15 minuten oud. Bij ontbrekende/ongeldige rol wordt toegang geweigerd; een Browser- of Googleprofiel zonder getekende Discord-identiteit kan niet promoveren tot Burgerraad.
- De huidige rol van het **dossieronderwerp** is een noodzakelijke voorwaarde. Geen BIO/Burger/raadsrol = geen nieuwe inzage of registratie.
- Geen eigen dossiernotities of eigen verlofgoedkeuring door de schrijver. Registraties zijn append-only en hebben audit met auteur en datum.
- Dit verleent geen rechten op andere hulpdiensten en creëert geen algemeen portaalgebruikersbeheer of weekrapportmachtiging.
- `GET /api/citizen-dossiers/access` is een kleine autorisatiecontrole voor de navigatie, geen dossierinhoud.

## Opbouw van elk individueel dossier

1. Verlof en verlofhistoriek: leest `bpd_leave_requests` voor dezelfde Discord-ID, met status/datum en zonder vrije vertrouwelijke aanvraagredenen. De Burgerraad kan zelf Burgerverlof goedkeuren. Bewaren gebeurt centraal als `subjectDepartments: ['burger']` en aanvullend in het persoonseigen dossier en audit, **zonder** wekelijkse Burgernotificaties.
2. Notities: vrije administratieve notities apart van observaties, titel, tekst, gebeurtenisdatum en geregistreerd door.
3. Overgang naar volwaardig: een expliciete, geauditeerde notitie met historische datum en motivatie. Kan pas worden ingevoerd zodra de huidige Discord-status Burger is. De historische overgangsdatum wordt niet afgeleid uit de huidige rol.
4. Observaties: apart register, optioneel cijfer 0–10 en gemiddelde.
5. Sancties: **mondeling** of **schriftelijk**, met motivering, datum, geregistreerd door.
6. Persoonsrapport: aantallen per onderdeel, gemiddelde observatiescore en alleen de eigen chronologie, via browser afdrukken/PDF. **Geen** Bürgerweekrapporten of algemene wekelijkse samenvatting.

Firestore: `bpd_burger_dossiers/{discordId}/entries`, `.../audit`. Centrale leave-collectie `bpd_leave_requests` wordt hergebruikt; de module schrijft niet naar `bpd_notices` of `bpd_cases` voor operationele hulpdiensten.

## Configuratie en uitrol

`BPD_ENABLE_CITIZEN_DOSSIERS=true` is verplicht; standaard **uit**. Zonder deze instelling blijven Burgerraad-API en bijhorende navigatie afgesloten. Bestaande Discord OAuth, Firebase-configuratie en geverifieerde ledenrollen blijven noodzakelijk. Geen nieuwe beveiligingssleutels of handmatig aangevulde rolvelden invoeren.

**TEST vóór MAIN.** Branch `feature/burgerdossiers-20261104` is afgeleid van actuele `main`; de oudere TEST-bron `feature/verlofmodule-test` is substantieel van MAIN afgeweken. Neem niet blind volledige MAIN-wijzigingen naar de aparte TEST-service over: verifieer de Render branchconfiguratie, maak een gecontroleerde TEST-deploy op `belgiepd-test` en activeer de vlag uitsluitend daar. Test de echte getekende Burgerraad-login, een BIO-lid, een Burger, een lid zonder Burgerraadrol, gescheiden burger/dienst-dossiers, verlofconflicten, persoonlijk rapport en het feit dat geen Burgerweekrapport verschijnt. Daarna pas een afzonderlijke MAIN-revisie en activering.

Deze module is voor fictieve roleplay-personeelsopvolging. Registreer geen echte medische gegevens, wachtwoorden of gevoelige privéinformatie in notities.
