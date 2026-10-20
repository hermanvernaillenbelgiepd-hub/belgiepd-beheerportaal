# BelgiëPD – personeelsdossier als centrale werkomgeving

**Sollicitaties staan stil.** Nieuwe hulpdienstsollicitaties en FiveM-kandidaten zijn niet opgenomen in deze release. De sollicitatie-API wordt niet meer in Express geregistreerd, de publieke pagina's geven HTTP 410 en de burgerpagina bevat geen aanmeldingen voor hulpdiensten. Historische Firestore-gegevens worden uitdrukkelijk niet verwijderd.

## Middenkader: dagelijkse persoonsopvolging
Open `/personeelsbeheer.html` → kies hulpdienst en medewerker → open fiche:
- Toegankelijke verlofperiodes en openstaande aanvragen worden uit `bpd_leave_requests` opgehaald. Alleen aanvragen waarvoor `mayApproveLeave` toestemming geeft tonen goedkeuren/afwijzen. De bestaande grens van 30 dagen voor middenkader blijft behouden.
- Handmatig ingeschreven verlof wordt, indien apart geactiveerd, met `POST /api/leave/manual` in exact **dezelfde** verlofcollectie opgeslagen. De server controleert unieke identiteit, rol binnen de doelhulpdienst, kalenderduur, zelfgoedkeuring en registreert een audit.
- Kadernotities, dienstactiviteiten en specialisatiebeperkingen worden vastgelegd met `POST /api/management/cases` in de **bestaande** `bpd_cases`-collectie. Het is een administratieve beperkingstekst; de Discord-rol en bevoegdheid worden niet automatisch aangepast.
- Opleidingen worden opgehaald via `GET /api/training/:department/:discordId`, waarbij de bestaande opleidings- en instructeursrechten gelden. Nieuwe opleidingsresultaten worden uitsluitend in de bestaande opleidingsmodule ingevoerd.
- Formele observaties en sancties worden gelezen met `GET /api/registrations/entries`, met behoud van het bestaande sanctie-/observatierecht en de regels voor zware maatregelen.
- De bestaande historische personeelsnotities blijven alleen-lezen; er komt géén tweede notitieschrijver.

## Officierenkader en korpsleiding
- Kunnen naast de middenkadertaken (afhankelijk van dienst en rang) de bestaande administratieve basisvelden wijzigen zodra de aparte personeelsvlaggen geactiveerd zijn.
- Personeelsbewegingen en naamswijzigingsregistraties blijven uitsluitend voor hogere kaderrollen, op de **betrokken dienst** afgedwongen door `roleForDepartment`.
- De bestaande promotie-API blijft apart gelimiteerd tot goedgekeurde, gekoppelde Firestore-politiefiches en geautoriseerde leiding; Google Sheets-rangen kunnen niet ongemerkt overschreven worden.
- **Discord-ID-herkoppeling** is bewust nog niet als vrij invulbaar veld beschikbaar: deze ID is momenteel een sleutel in meerdere externe registers. Een gecontroleerde migratie met audit en identiteitsbewijs is nodig voordat die kan worden gewijzigd.

## Discord-koppelingen
`GET /api/staff-dossiers/:dept/:discordId` voegt uitsluitend bij bevoegd gelezen personeelsfiches de herkenbare Discord-rollen toe:
- Specialisaties en opleidingsstadia uit de rolcatalogus.
- Politie-reeks uit de rolcatalogus, naast een eventuele reeks uit de bestaande personeelsbron.
- Alleen guildrollen waarvan de Discord-authenticatie maximaal 15 minuten geleden is geverifieerd. Anders wordt **niet geverifieerd** getoond, nooit een veronderstelde specialisatie.
- Deze feiten zijn **alleen-lezen**: Discord-rollen en portaalrechten worden nooit automatisch aangepast.

## Productievlaggen

Bestaande schakelaars:
- `BPD_ENABLE_STAFF_DOSSIERS=true`: beveiligde inzage in personeelsdossiers.
- `BPD_ENABLE_STAFF_DOSSIER_WRITES=true`: hoge-kaderwijziging van administratieve dossiergegevens.
- `BPD_ENABLE_LEAVE_WRITES=true`: bestaande verlofaanvragen behandelen.
- `BPD_ENABLE_REGISTRATIONS=true` en `BPD_ENABLE_MANAGEMENT_WRITES=true`: bestaande kaderregistraties.

Nieuwe, losstaande schakelaar:
- `BPD_ENABLE_PERSONNEL_MANUAL_LEAVE=true` **én** `BPD_ENABLE_LEAVE_WRITES=true`: handmatige goedgekeurde verlofinschrijvingen (beide standaard UIT).

Activeer schrijffuncties pas na testen met fictieve medewerkers in het `belgiepd-test` Firebase-project en een middenkaderaccount plus hoger-kaderaccount. De nieuwe functies verlenen geen rechten op een andere dienst.

## Niet in deze fase
Echte Discord-ID-migratie, een nieuw bot-fed reeksnummer, geautomatiseerde specialisatie-intrekking, automatische sancties, uitrol van nieuwe sollicitaties, of het wissen van oude Firestore-dossiers. Deze onderdelen vereisen geverifieerde bronkoppelingen en expliciete beheerprocedures.
