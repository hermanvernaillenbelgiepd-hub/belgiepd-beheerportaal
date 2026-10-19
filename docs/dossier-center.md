# BelgiumPD – centraal dossiercentrum (alleen-lezen)

## Doel
Het dossiercentrum op `/dossiercentrum.html` geeft een samengebracht overzicht van personeelsfiches, rangwijzigingen, auditgeschiedenis en hulpdienstsollicitaties. Het maakt **geen** nieuwe personen aan, voegt geen Firestore-documenten samen en kent geen Discord- of portaalrechten toe. De echte FiveM-bewijsbron blijft apart.

## Activeren
De API staat standaard uit. Zet pas na de toegangscontrole in TEST (en later MAIN) de Render-omgevingsvariabele `BPD_ENABLE_DOSSIER_CENTER=true`. Er zijn geen nieuwe secrets of database-migraties nodig.

* Personeelsgegevens komen uit dezelfde bestaande `getSnapshot()` als het personeelsbeheer; Google Sheets blijven alleen-lezen.
* Sollicitaties zijn uitsluitend beschikbaar wanneer `BPD_ENABLE_SERVICE_APPLICATIONS=true` en alleen voor hun bevoegde hulpdienstkader. Zonder die vlag is het sollicitatiedeel verborgen.
* Een medewerker of sollicitant wordt op **dienst + Discord-ID** opgezocht. Dit is een administratieve verwijzing, geen bewijs dat een handmatig ingevoerde identiteit correct werd bevestigd.
* Toegangsrechten worden bij **iedere API-aanvraag** server-side gecontroleerd. `middenkader` kan personeelsfiches zien waar die bevoegd is, maar geen sollicitaties van kandidaten wanneer het niet mag beoordelen.
* De tijdlijn leest bestaande audit-subcollecties uit Firestore. Het dossiercentrum zelf schrijft geen persoonsgegevens of auditregels.
* De eerste versie toont alleen **gekoppelde personeelsfiches met Discord-ID** en bestaande sollicitaties; niet-gekoppelde conceptmedewerkers blijven in Personeelsbeheer wachten op identiteitskoppeling.
* Voor burgers zonder sollicitatie, personeelstoegang of FiveM-identiteit is nog geen automatisch dossier beschikbaar. Dit volgt pas als de echte FiveM- of Discord-botbron betrouwbaar beschikbaar is.

## Technisch
- `GET /api/dossiercentrum/overview`: per dienst gefilterde, minimale rijen; geen sollicitatiemotivaties.
- `GET /api/dossiercentrum/:dept/:discordId`: dossierdetails met per dienst afzonderlijke machtiging voor personeelsdata en sollicitatiegegevens; maximaal 50 auditregels in de gecombineerde tijdlijn.
- De algemene `/api/data`, Google Sheets en bestaande personeels- en sollicitatie-API's zijn niet veranderd.
- Te grote kandidaatresultaten worden afgebroken (meer dan 100 per dienst) om stilzwijgend onvolledige lijsten te vermijden.
- Bestaande toegangsregels `canViewPersonnel` en `canCreatePersonnel` worden hergebruikt.

## Testplan vóór activatie
1. Test met een gebruiker die alleen rechten heeft op politie: geen ambulance-, brandweer- of depannagedossiers zichtbaar.
2. Test met middenkader ambulance: wel toegelaten personeelsfiches, geen vertrouwelijke sollicitatiemotivaties.
3. Test met bevoegde korpsleiding ambulance: uitsluitend de sollicitaties van ambulance zichtbaar.
4. Vergelijk een personeelslid met een geregistreerde promotie: auditgeschiedenis wordt weergegeven, de rang in Google Sheets blijft intact.
5. Controleer dat zonder `BPD_ENABLE_DOSSIER_CENTER=true` alle dossier-API's `503` retourneren na geldige authenticatie.
6. Bevestig dat een niet-gekoppelde Discord-identiteit geen personeelsrechten of dossierinzage krijgt.

De bot/FiveM-koppeling kan later aansluiten zonder nieuwe dossierstructuur of dubbel geregistreerde bestanden.


## Verbeteringen in het dossieroverzicht

De pagina `/dossiercentrum.html` biedt voortaan:
- Zoeken op naam, roepnummer, rang, status of Discord-ID, met hoofdletter- en accentongevoelige matching.
- Filter per toegelaten hulpdienst, personeel/sollicitatie/beide en sollicitatiestatus.
- Samenvattende aantallen **uitsluitend binnen de toegelaten serverdata**.
- Paginering van 25 zichtbare dossiers; zoekfilters veranderen nooit de serverautorisatie.
- Detailweergave met afzonderlijke werklinks naar het personeels- of sollicitatiebeheer (geen automatische dossieroverdracht).
- Gecombineerde auditweergave met filter op loopbaan, personeelswijzigingen, sollicitaties of burgerregistratie.
- Sollicitatiebesluiten tonen waar geregistreerd ook de vorige en nieuwe workflowstatus.
- Registratiehistoriek van een burgerdossier is uitsluitend zichtbaar bij een al bevoegd bekeken personeelsfiche of hulpdienstsollicitatie voor exact die Discord-ID.

**Privacy:** deze pagina is geen algemene burgerzoekmachine. Het dossiercentrum toont geen burgers zonder bestaande, toegankelijke dienstgebonden personeels- of sollicitatieverwijzing. Er worden geen nieuwe dossierrechten, identiteitsbewijzen of Discord-rollen aangemaakt. Sollicitaties blijven verborgen als de bestaande sollicitatiemodule uitgeschakeld is.

**Test op echte accounts:** bevestig afzonderlijk dat een politie-kaderlid geen motivaties van ambulance ziet, dat een ambulancemedewerker zonder sollicitatiebeoordelingsrecht geen kandidaten kan opzoeken, en dat burgerregistraties alleen voorkomen waar die koppeling daadwerkelijk al bestaat. De geautomatiseerde tests controleren de filterlogica en autorisatiestructuur, niet de volledige productiegegevens.
