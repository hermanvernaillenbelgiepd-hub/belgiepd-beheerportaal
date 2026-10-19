# BelgiumPD – volwaardig administratief personeelsdossier

Deze uitbreiding staat **uitsluitend in Personeelsbeheer** (`/personeelsbeheer.html`). Nieuwe sollicitaties, kandidaten en burgerdossiers vallen buiten de scope.

## Eén personeelsfiche, geen dubbele registratie
De identificatie blijft `hulpdienst + Discord-ID` uit de bestaande personeelslijst. Het dossier is alleen opvraagbaar indien de medewerker **exact één keer** voorkomt in de bestaande brongegevens; dubbelzinnige personeels-ID's worden geblokkeerd.

De bestaande naam, officiële rang, roepnummer, personeelstatus en standaard personeelsgeschiedenis komen ongewijzigd uit de huidige personeelssnapshot, overlays en bestaande auditcollecties. Een administratieve aanvulling schrijft **nooit** in Google Sheets of Discord-rollen. Sollicitatie- en burgerdossiers worden niet aangemaakt.

## Nieuwe administratieve onderdelen
- **Aanstellingsdatum** (optioneel; alleen geldige kalenderdatums).
- **Eenheid/ploeg** (optioneel).
- **Functie/opdracht** (optioneel).
- **Bestaande opleidingen:** resultaten uit de bestaande `bpd_training`-registraties, alleen raadpleegbaar via de reeds bestaande opleidingsrechten.
- **Bestaande kadernotities:** het huidige `bpd_cases`-register met type `notitie`, enkel zichtbaar via de bestaande kaderbevoegdheden.
- **Historiek:** wie administratieve basisgegevens heeft aangepast, wanneer en waarom, plus de bestaande officiële rang- en wijzigingsgeschiedenis.
- **Doorklikken:** opleidingen via `/rollen-opleidingen.html`, kadernotities via `/weekrapporten.html`, observaties/sancties via `/registraties.html`, verlof via `/verlofbeheer.html`.

### Firestore
`bpd_staff_dossiers/{dept}_{discordId}` bevat alleen aanvullende metadata en een aparte revisieteller, geen gekopieerde personeelsnaam/rang of Google Sheets-document.

`entries`: oudere append-only notities met oorspronkelijke auteur en tijdstip; uitsluitend lezen, niet opnieuw invoeren.
`audit`: append-only registratie van administratieve metadatawijzigingen. Eerdere notitiegebeurtenissen blijven bewaard en raadpleegbaar.

### Toegangsrechten
`GET /api/staff-dossiers/:dept/:discordId` vereist bestaande portaal-authenticatie én `canViewPersonnel` voor **die specifieke dienst**.

`POST .../profile` vereist daarnaast `canEditPersonnel`, dus bevoegd officierskader/korpsleiding/beheerder, geen eigen dossierwijziging en geen bewerking van hoger beschermd kader buiten bevoegdheid. Het oude endpoint `POST .../notes` geeft altijd HTTP 410 (uitgeschakeld) terug, ook als de dossier-schrijfvlag op TEST actief is. Nieuwe notities worden uitsluitend in het bestaande kaderregister aangemaakt.

### Veilig uitrollen
Twee onafhankelijke instellingen:
- `BPD_ENABLE_STAFF_DOSSIERS=true` laat bevoegd kader dossiers bekijken.
- `BPD_ENABLE_STAFF_DOSSIER_WRITES=true` laat alleen bevoegd kader aanvullingen opslaan; heeft geen effect zonder de eerste vlag.

**Standaard staan beide uit.** De schrijfoptie heeft uitsluitend betrekking op aanvullende administratieve basisgegevens; opleidingen, kadernotities en observaties hebben hun eigen bestaande machtigings- en opslagproces. Het verdient aanbeveling het schrijfproces eerst met gecontroleerde fictieve personeelsleden in de afzonderlijke TEST-Firebase omgeving te beproeven. In MAIN kan de read-only variant eerst worden geactiveerd. Wijzig bestaande centrale personeels-, role- of Sheets-instellingen niet voor deze functie.

## Afbakening
Dit is administratieve RP-personeelsopvolging, **geen** afzonderlijk medisch, strafrechtelijk of disciplinair dossier. Registreer geen echte medische gegevens, wachtwoorden of gevoelige privégegevens in open notitietekst. Voor formele sancties en uitgebreidere beoordelingen blijven de bestaande beschermde management- en opleidingsmodules van toepassing.

Voor medewerkers zonder gekoppelde Discord-ID bestaat de bestaande gecontroleerde intakewachtrij. Deze module creëert pas een actief personeelsdossier na een correcte unieke koppeling. Een ingevulde aanstellingsdatum is een administratieve registratie, geen automatisch extern geverifieerd bewijs.


## Correctie: géén dubbele formulieren

Het oorspronkelijke aanvullende dossier had een apart formulier voor `opleiding`, `evaluatie` en `administratief`. Daardoor konden dezelfde gebeurtenissen naast de bestaande opleidings- of kaderregistratie nogmaals ingevoerd worden. Dit formulier en de bijhorende schrijfactie zijn ingetrokken, **zonder historische gegevens te verwijderen**.

Bij een geopende personeelsfiche worden bestaande opleidingsresultaten rechtstreeks uit de opleidings-API gelezen en bestaande personeelsnotities rechtstreeks uit de kaderregistratie-API. Beide endpoints controleren hun **eigen** rechten; wanneer iemand de benodigde rechten niet heeft, toont de personeelsfiche die gegevens niet. Dubbelen in historische bronnen worden niet stilzwijgend gecombineerd of verwijderd.

Het nieuwe aanvullende gegevensformulier blijft beperkt tot aanstellingsdatum, ploeg/eenheid en functie, met een afzonderlijke revisie- en auditcontrole. Nieuwe opleidingen of observaties registreert men **eenmalig in de daarvoor bedoelde bestaande module**. Er wordt geen nieuwe persoon of tweede opleidingsrecord aangemaakt.
