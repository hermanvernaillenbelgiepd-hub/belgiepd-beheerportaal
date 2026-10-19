# BelgiumPD – volwaardig administratief personeelsdossier

Deze uitbreiding staat **uitsluitend in Personeelsbeheer** (`/personeelsbeheer.html`). Nieuwe sollicitaties, kandidaten en burgerdossiers vallen buiten de scope.

## Eén personeelsfiche, geen dubbele registratie
De identificatie blijft `hulpdienst + Discord-ID` uit de bestaande personeelslijst. Het dossier is alleen opvraagbaar indien de medewerker **exact één keer** voorkomt in de bestaande brongegevens; dubbelzinnige personeels-ID's worden geblokkeerd.

De bestaande naam, officiële rang, roepnummer, personeelstatus en standaard personeelsgeschiedenis komen ongewijzigd uit de huidige personeelssnapshot, overlays en bestaande auditcollecties. Een administratieve aanvulling schrijft **nooit** in Google Sheets of Discord-rollen. Sollicitatie- en burgerdossiers worden niet aangemaakt.

## Nieuwe administratieve onderdelen
- **Aanstellingsdatum** (optioneel; alleen geldige kalenderdatums).
- **Eenheid/ploeg** (optioneel).
- **Functie/opdracht** (optioneel).
- **Opvolgingsnotities:** opleiding, begeleiding, functioneringsgesprek, administratieve opvolging en waardering.
- **Historiek:** wie heeft administratieve basisgegevens aangepast, waarom en wanneer; vastgelegde administratieve opvolgingsnotities met auteur/tijdstip, plus de bestaande officiële rang- en wijzigingsgeschiedenis.
- **Doorklikken:** bestaande pagina's voor opleidingen, registraties en verloven. Die pagina's blijven hun eigen bevoegdheden afdwingen.

### Firestore
`bpd_staff_dossiers/{dept}_{discordId}` bevat alleen aanvullende metadata en een aparte revisieteller, geen gekopieerde personeelsnaam/rang of Google Sheets-document.

`entries`: append-only notities met categorie, onderwerp, toelichting, tijdstip en auteur.
`audit`: append-only registratie van metadatawijzigingen (voor/na + motivering) en notitie-registraties. Een aangemaakte notitie kan via deze module niet ongemerkt gewijzigd of verwijderd worden.

### Toegangsrechten
`GET /api/staff-dossiers/:dept/:discordId` vereist bestaande portaal-authenticatie én `canViewPersonnel` voor **die specifieke dienst**.

`POST .../profile` en `POST .../notes` vereisen daarnaast `canEditPersonnel`, dus bevoegd officierskader/korpsleiding/beheerder, geen eigen dossierwijziging en geen bewerking van hoger beschermd kader buiten bevoegdheid. Een notitie registreert verplicht de goedgekeurde Discord-ID van de auteur.

### Veilig uitrollen
Twee onafhankelijke instellingen:
- `BPD_ENABLE_STAFF_DOSSIERS=true` laat bevoegd kader dossiers bekijken.
- `BPD_ENABLE_STAFF_DOSSIER_WRITES=true` laat alleen bevoegd kader aanvullingen opslaan; heeft geen effect zonder de eerste vlag.

**Standaard staan beide uit.** Het verdient aanbeveling het schrijfproces eerst met gecontroleerde fictieve personeelsleden in de afzonderlijke TEST-Firebase omgeving te beproeven. In MAIN kan de read-only variant eerst worden geactiveerd. Wijzig bestaande centrale personeels-, role- of Sheets-instellingen niet voor deze functie.

## Afbakening
Dit is administratieve RP-personeelsopvolging, **geen** afzonderlijk medisch, strafrechtelijk of disciplinair dossier. Registreer geen echte medische gegevens, wachtwoorden of gevoelige privégegevens in open notitietekst. Voor formele sancties en uitgebreidere beoordelingen blijven de bestaande beschermde management- en opleidingsmodules van toepassing.

Voor medewerkers zonder gekoppelde Discord-ID bestaat de bestaande gecontroleerde intakewachtrij. Deze module creëert pas een actief personeelsdossier na een correcte unieke koppeling. Een ingevulde aanstellingsdatum is een administratieve registratie, geen automatisch extern geverifieerd bewijs.
