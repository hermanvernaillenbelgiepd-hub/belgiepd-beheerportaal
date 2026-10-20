# Sonoran Radio in het TO-dienstbord

Het TO-dienstbord toont de verbonden Sonoran Radio-gebruikers en hun kanaal. Het gebruikt de bestaande portaal-aanmelding en politierechten. De browser vraagt gegevens aan bij de eigen backend; de Community API Key blijft op de server.

## Instellen op Render TEST

Open in Render de webservice die hoort bij `belgiepd-beheerportaal-testserver.onrender.com`. Voeg onder de omgevingsvariabelen toe:

| Naam | Waarde |
| --- | --- |
| `SONORAN_RADIO_COMMUNITY_ID` | Jullie Sonoran Radio Community ID |
| `SONORAN_RADIO_API_KEY` | De geheime Sonoran Radio Community API Key |

De oorspronkelijke app verwijst hiervoor naar de administratie van jullie Sonoran Radio-community. Bewaar de API Key als serverinstelling; zet hem niet in HTML, browseropslag, GitHub, exports of chat. Sla de Render-instellingen op en laat de TEST-service opnieuw deployen. Controleer ook dat deze service de bedoelde TEST-branch volgt.

De twee waarden moeten op de **Render-testservice** staan. Cloudomgevingsinstellingen van Codex wijzigen de Render-instellingen niet automatisch. Bestaande Firebase- en Discord-instellingen blijven nodig voor aanmelding.

De server moet via HTTPS toegang hebben tot `api.sonoranradio.com`. Er is geen extra database, package, Sonoran-webhook of apart proces nodig.

## Testen in het portaal

1. Open `/to-dienstbord.html` op TEST en meld je aan met je politieaccount.
2. Het radiopaneel toont of de koppeling is ingesteld, de laatste geslaagde controle en de verbonden gebruikers per kanaal. De gegevens verversen iedere vijftien seconden zolang de pagina zichtbaar is. Met **Vernieuwen** kun je opnieuw de actuele serverstatus opvragen.
3. Voor herkenning gebruikt de koppeling het bestaande formaat `CATEGORIE - NUMMER | NAAM`, bijvoorbeeld `SANTO - 620 | Alex`. De categorie moet een bekende TO-categorie zijn en het roepnummer bestaat uit één tot vijf cijfers.
4. De huidige TO kan bij een herkenbare radio-eenheid **Ploeg toevoegen** kiezen. Controleer de vooraf ingevulde gegevens en bevestig de ploeg. Zonder naam blijft het naamveld leeg en moet de TO het aanvullen. Een radio-naam vormt geen geverifieerde personeels- of Discord-koppeling.
5. Een bestaande ploeg blijft haar handmatige beschikbaarheid en meldingstoewijzingen behouden. Een radioverbinding staat los van het beschikbaar zijn voor een oproep. Een lege radiorespons of een verbroken radioverbinding haalt geen ploegen uit dienst en wist geen meldingen.

Basiskader kan het radio-overzicht bekijken. Ploegen toevoegen blijft voorbehouden aan de huidige TO met bedieningsrecht. Dubbele of niet herkende roepnummers worden niet automatisch samengevoegd tot een ploeg.

## Techniek

De beveiligde route `GET /api/to/radio` gebruikt dezelfde `requireUser`-controle en afbakening op politie als het dienstbord. De route wijzigt geen TO-gegevens of Firestore-records.

De server leest uitsluitend:

```text
GET https://api.sonoranradio.com/v2/servers/{communityId}/connected-users
Authorization: Bearer <serverinstelling>
```

De host staat vast. Er worden geen redirects gevolgd, aanvragen hebben een time-out en responsen zijn begrensd. Gelijktijdige aanvragen delen één upstreamaanvraag en de status wordt kort gecachet, zodat meerdere meekijkende collega's niet ieder apart Sonoran belasten.

Bij een fout wordt een korte melding getoond. Eerder geslaagde gegevens kunnen zichtbaar blijven met een verouderingsmelding en het tijdstip van de laatste geslaagde controle. Zo'n oude radiosnapshot kan niet als nieuwe ploeg worden overgenomen. API-sleutels, autorisatieheaders, ruwe technische identiteiten en foutteksten van Sonoran worden niet naar de browser doorgestuurd.

Zonder beide instellingen geeft de route een niet-geconfigureerde status terug. Een geslaagde lege lijst betekent nul radioverbindingen. Testresultaten met gesimuleerde Sonoran-responsen bewijzen de verwerking en afscherming; echte communitytoegang moet met de ingestelde waarden op TEST worden gecontroleerd.

## Uitgevoerde controles

Alle 149 repositorytests en de syntaxcontroles slagen. De radiotests controleren onder meer politierechten, afscherming van de sleutel, naamherkenning, dubbele roepnummers, caching, time-outs/foutresponsen, begrensde responsen en herstel na een storing. Acht browsercontroles bevestigen de bediening op desktop en mobiel, vooraf ingevulde ploeggegevens met bevestiging, behoud van bestaande ploegen bij storingen en lege radioresponsen, leesrechten en wissen van radiogegevens bij afmelden. Daarbij zijn tijdelijke opslag, een gesimuleerde aanmelding en gesimuleerde Sonoran-responsen gebruikt. De werkelijke app start en weigert anonieme radio-aanvragen met HTTP 401.

De Community ID en API Key waren niet beschikbaar voor een controle van de echte community. Een succesvolle Git-push bewijst geen afgeronde Render-uitrol; controleer na die uitrol de communityverbinding in het radiopaneel.
