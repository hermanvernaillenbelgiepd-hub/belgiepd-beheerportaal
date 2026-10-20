# TO-dienstbord

De portaalmodule op `/to-dienstbord.html` vervangt de losse TO-prototypeopslag. De module bevat een lopende TO-dienst, eenheden en koppelploegen, beschikbaarheid, meldingen met ploegtoewijzingen, accountgebonden overnames en een dienstarchief. Het dashboard bevat een navigatielink; Discord-aanmelding keert terug naar het dienstbord.

## Gebruik

1. Open **TO-dienstbord** vanuit het beheerportaal en meld aan met je bestaande account.
2. Start een dienst met je herkenbare TO-naam. Het account bepaalt wie de dienst bedient; de naam is een weergavelabel.
3. Herkende live Sonoran-ploegen tellen automatisch mee bij ploegen in dienst en beschikbaarheid. Voeg een ploeg toe met een operationele categorie en één of twee bemanningsleden om haar status en meldingen te beheren. Bij koppelrijden bepaalt het hoogste numerieke roepnummer de ploegnaam; de radio's van beide leden tellen samen één ploeg.
4. Maak meldingen aan, koppel ploegen en werk de status bij. Een ploeg op een actieve melding telt als bezet, ook wanneer haar handmatige beschikbaarheid aanstaat.
5. Een volgende bevoegde TO kan de dienst met het eigen account overnemen. De vorige TO verliest de bediening en de overname wordt vastgelegd.
6. Rond actieve meldingen af voordat je de dienst afsluit. De server bewaart het archief en beëindigt de lopende dienst in één transactie. Vertrokken ploegen blijven in de diensthistoriek behouden.

Het bord wordt periodiek ververst. Een verbroken verbinding of versieconflict wordt zichtbaar gemeld; een mislukte wijziging wordt niet als opgeslagen gepresenteerd. Archieven zijn alleen-lezen en kunnen als JSON worden geëxporteerd.

De radio- en ploegenlijsten zijn gegroepeerd onder Politie, Brandweer, Ambulance en Depannage. **Ambulancedienst** herkent aanvullend de zeven operationele callsigngroepen `DIRMED`, `HARTS`, `HVPK`, `HAMB`, `ARTS`, `VPK` en `AMB`, elk met een positief numeriek roepnummer van één tot vijf cijfers. Sonoran-labels in de vorm `HAMB-12`, `HAMB 12`, `HAMB12` en `HAMB - 12` vallen daardoor onder Ambulance; de prefixen worden afzonderlijk herkend (bijvoorbeeld HARTS is niet ARTS). Eerdere categorieën zoals `AMBULANCE`, `MUG`, `PIT` en `DIR-MED` blijven beschikbaar. Een roepnaam zonder geldig nummer wordt wel herkend als categorie, maar is niet automatisch als eenheid toe te voegen. De dienstindeling geeft geen personeels- of Discord-rechten. SANTO en de andere politiecategorieën staan onder Politie; BWM wordt als eigen brandweercategorie herkend. Binnen de categorieën lopen de roepnummers numeriek op. Het categoriefilter kan een hele hulpdienst of één categorie tonen. Niet-herkende radiolabels blijven zichtbaar onder Overige.

## Radio-calltekens NB en koppeldienst (*)

- De aanduiding `NB` of `(NB)` als los element (hoofdletterongevoelig) in **om het even welk deel van de radiocall** betekent **Niet beschikbaar**. Dit is een afgeleide operationele radiostatus; geen Firestore- of Discordwijziging.
- Een `*` direct achter het **numerieke roepnummer**, bijvoorbeeld `SANTO-600*`, markeert **koppeldienst**. Het dienstbord toont 👥 en bundelt radioleden **uitsluitend als hulpdienstcategorie én numeriek ploegroepnummer overeenkomen**, ook bij voorloopnullen.
- Is een van de leden van die ploeg `NB`, dan is de **volledige ploeg niet beschikbaar** en wordt ze niet als beschikbaar meegeteld. De ploeg blijft wel in dienst geteld; hetzelfde principe geldt voor reeds handmatig geregistreerde ploegen.
- Deze afgeleide status wordt alleen op **actuele Sonoran Radio-informatie** toegepast. Bij een verouderde verbinding krijgen opgeslagen TO-gegevens weer voorrang. NB en de ster wijzigen geen opgeslagen roepnummer, koppelen geen ongekende personen en verlenen geen toegangsrechten.
- Een gegroepeerde radiokoppel met twee hetzelfde nummer delende radiogebruikers wordt **niet automatisch als twee handmatige leden opgeslagen**: het bestaande formulier eist onderscheiden persoonlijke roepnummers. De radioweergave kan de ploeg toch onmiddellijk als één tonen; een TO kan de effectieve bemanning afzonderlijk verifiëren.

## Toegang en opslag

De module gebruikt dezelfde Firebase/Discord-sessie als het portaal en dezelfde backendcontrole `requireUser`. Er is geen tweede account nodig. De hulpdienst moet expliciet `politie` zijn; de operationele categorieën SANTO, BLAINE enzovoort zijn geen hulpdienstmachtigingen.

| Politierol | Toegang |
| --- | --- |
| Basiskader | Bord en archief bekijken |
| Middenkader, officierenkader, korpsleiding, beheerder | Bekijken, een dienst starten en overnemen |
| Huidige TO met een van de bovenstaande bedieningsrollen | Ploegen en meldingen bijwerken, dienst afsluiten |

De rol wordt per hulpdienst bepaald. Een hoge rang bij een andere hulpdienst geeft geen TO-bedieningsrecht. Weergavenamen verlenen geen rechten. Deze eerste versie verleent geen extra toestemming op basis van een zelfgekozen specialisatie of roepnummer.

Gedeelde gegevens worden door de server met Firebase Admin opgeslagen:

- `bpd_to_boards/politie`: actuele toestand en revisienummer.
- `bpd_to_archives/{dienst-id}`: onveranderlijke afsluitingsmomentopname, afgeschermd op hulpdienst.

Iedere wijziging vereist de gelezen `expectedRevision`. De server kent IDs, tijdstippen, meldingsnummers en auditidentiteit toe. Een verouderd verzoek krijgt HTTP 409. Opdrachten hebben begrensde velden en aantallen; het actuele document blijft onder de Firestore-documentlimiet. De browser krijgt geen rechtstreekse Firestore-schrijftoegang.

## API

Alle routes vereisen een geldig Firebase Bearer-token en politierechten:

| Methode | Route | Resultaat |
| --- | --- | --- |
| GET | `/api/to/board` | Actueel bord, categorieën en eigen bedieningsrechten |
| POST | `/api/to/commands` | Getypeerde wijziging met `expectedRevision`; bijgewerkt bord |
| GET | `/api/to/archives` | Begrensd overzicht van afgesloten diensten |
| GET | `/api/to/archives/{id}` | Alleen-lezen dienstarchief |

Opdrachten zijn `start`, `takeover`, `add-team`, `remove-team`, `toggle-team`, `create-incident`, `update-incident`, `incident-status`, `attach-team`, `detach-team` en `close-session`. De client mag geen volledig bord of eigen auditvelden overschrijven. Er is geen route voor het wissen van archieven.

## Ontwikkelen en uitrollen

Gebruik de bestaande checkout; er is geen extra service, package of buildstap nodig:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm start
```

Voor gedeelde opslag zijn de bestaande Firebase-projectconfiguratie en werkende Google Application Default Credentials vereist. Het serviceaccount moet de twee genoemde Firestore-collecties kunnen lezen en schrijven. Zonder die configuratie kan de app wel starten, maar is echte aanmelding/opslag niet beschikbaar. Er wordt dan geen stilzwijgende lokale kopie gemaakt. Er zijn geen nieuwe geheimen of productiegegevens in de code opgenomen.

De bestaande applicatie hoort met deze wijziging te worden gedeployed om de route en navigatie in het live portaal beschikbaar te maken. Een lokale implementatie of geslaagde test voert geen productie-uitrol uit.

## Base44, radio en personeelsgegevens

Het eenhedenoverzicht gebruikt dezelfde categorie/roepnummer/beschikbaarheidsfunctie als de eerder onderzochte Base44-frontend. Deze eigen module is niet afhankelijk van Base44. Het Sonoran Radio-paneel leest verbonden radio-eenheden via de eigen backend. Herkende ploegen tellen automatisch mee, zonder dubbele telling van een bestaande ploeg of koppelploeg. Extra radioploegen gelden standaard als beschikbaar totdat de TO ze toevoegt en een andere status vastlegt. Een opgeslagen pauze of actieve melding heeft voorrang. De huidige TO kan een herkende eenheid na controle als ploeg toevoegen. De koppeling verwijdert geen opgeslagen eenheden op basis van een lege radiosnapshot. Zie [Sonoran Radio instellen en testen](sonoran-radio-koppeling.md).

De aangeleverde bestanden bevatten geen echte Base44-records, radiogegevens of TO-diensten. Base44-import en koppeling van bemanningsnamen aan geverifieerde personeelsdossiers zijn niet aangesloten. Voor Sonoran zijn de Community ID en geheime Community API Key als Render-serverinstellingen nodig. Bestaande Sheets, personeelsdossiers en Discord-rollen worden door het TO-bord niet gewijzigd.

Er zijn afzonderlijke tests voor het dienstverloop, politierechten, eigendom, versieconflicten en de HTTP-routes. Browsercontroles kunnen lokaal een aangemelde testsessie en tijdelijke opslag simuleren; dat bewijst geen toegang tot de productie-Firebase-database.

## Uitgevoerde controles

- `npm run check`: geslaagd, inclusief de nieuwe server- en browsermodules.
- `npm test`: 172 tests geslaagd, geen overgeslagen tests; inclusief tien afzonderlijke controles van de gecombineerde TO- en radiotelling, BWM-herkenning en vijf tests van de gedeelde hulpdienstindeling.
- Werkelijke Express-app: pagina en assets bereikbaar; alle vier TO-API-routes weigeren anonieme verzoeken met HTTP 401.
- Chromium op desktop en mobiel: starten, koppelploeg toevoegen, melding toewijzen/afronden, versieconflict, accountovername, ploeg uit dienst, archivering, JSON-download en basiskader-leesrechten gecontroleerd.
- De browsercontrole gebruikt de echte TO-routes en beleidsfuncties met tijdelijke opslag en gesimuleerde Firebase-aanmelding. Op de app zonder Firebase-configuratie is de duidelijke aanmeldmelding gecontroleerd. Er is geen productie-uitrol of live Firebase-schrijfactie uitgevoerd.
