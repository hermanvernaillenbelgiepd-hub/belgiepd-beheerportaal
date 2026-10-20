# Sonoran Radio in het TO-dienstbord

Het TO-dienstbord toont de verbonden Sonoran Radio-gebruikers en hun kanaal. Het gebruikt de bestaande portaal-aanmelding en politierechten. De browser vraagt gegevens aan bij de eigen backend; de Community API Key blijft op de server.

De knop **Sonoran Radio ↗** opent jullie community op `https://sonoranradio.com/com/T5NZTAY0` in een nieuw tabblad. Deze openbare communitylink bevat geen API Key. De linkcode `T5NZTAY0` is nog niet gecontroleerd als API-Community ID; gebruik voor de serverinstelling de waarde die Sonoran in de communityadministratie vermeldt.

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
4. Herkende radio-ploegen tellen direct mee bij **Ploegen in dienst** en **Beschikbaar**, ook voordat ze als ploeg op het dienstbord zijn opgeslagen. Alleen een bekende categorie met een geldig afzonderlijk roepnummer telt mee. De telling gebruikt de volledige categorie en het numerieke roepnummer: `SANTO - 00620` en `SANTO - 620` tellen samen één keer, terwijl `AMBULANCE - 620` en `AMBULANCE-MOTOR - 620` twee ploegen zijn. Meerdere radiogebruikers met hetzelfde ploeglabel vormen één getelde ploeg.
5. De huidige TO kan bij een herkenbare radio-eenheid **Ploeg toevoegen** kiezen om de ploeg te beheren, te pauzeren of aan een melding te koppelen. Controleer de vooraf ingevulde gegevens en bevestig de ploeg. Zonder naam blijft het naamveld leeg en moet de TO het aanvullen. Een radio-naam vormt geen geverifieerde personeels- of Discord-koppeling. Dubbele radiolabels blijven niet rechtstreeks te importeren.
6. Een bestaande ploeg blijft haar handmatige beschikbaarheid en meldingstoewijzingen behouden. Een gepauzeerde ploeg of een ploeg op een actieve melding telt niet als beschikbaar, ook als haar radio online is. Radio's van beide leden van een opgeslagen koppelploeg tellen samen één ploeg. Een ploeg die de TO in deze dienst uit dienst heeft gehaald, wordt niet door haar nog verbonden radio opnieuw meegeteld.
7. Ploegen die alleen via radio bekend zijn, gelden volgens de gekozen TO-afspraak standaard als beschikbaar; Sonoran zelf levert geen operationele beschikbaarheidsstatus. De tellers tonen hoeveel ploegen op het dienstbord staan en hoeveel extra via radio meetellen. Bij een storing of verouderde radiorespons vervallen alleen de extra radiotellingen. Opgeslagen ploegen en meldingen blijven behouden. Een succesvolle lege radiolijst betekent dat er geen extra radioploegen meetellen.

Basiskader kan het radio-overzicht en de tellingen bekijken. Ploegen opslaan blijft voorbehouden aan de huidige TO met bedieningsrecht. Automatisch tellen schrijft geen ploegen, bemanningsnamen of andere gegevens naar Firestore.

Naast de bestaande politiecategorieën zijn ook beschikbaar: `AMBULANCE`, `AMBULANCE-MOTOR`, `PIT`, `MUG`, `MUGHELI`, `DIR-MED`, `SIT-TEAM`, `BRANDWEER`, `ZONE-COMM`, `PLOEG1`, `PLOEG2`, `PLOEG3`, `LSRA-DEPA100`, `LSRA-DEPAK200`, `LSRA-F.A.S.T.` en `LSRA-ANWV`. De volledige categorienaam blijft behouden, ook met koppeltekens en punten. Bijvoorbeeld: `AMBULANCE-MOTOR - 620 | Alex` en `LSRA-F.A.S.T. - 100 | Alex`. Een los label zoals `LSRA-DEPA100` zonder afzonderlijk roepnummer blijft alleen een radiolabel; de koppeling verzint geen bemanning of roepnummer. De categorieën zijn ook te kiezen bij handmatig toevoegen en filteren. Ze wijzigen de bestaande portaalrechten niet.

## Techniek

De beveiligde route `GET /api/to/radio` gebruikt dezelfde `requireUser`-controle en afbakening op politie als het dienstbord. De route wijzigt geen TO-gegevens of Firestore-records.

De server leest uitsluitend:

```text
GET https://api.sonoranradio.com/v2/servers/{communityId}/connected-users
Authorization: Bearer <serverinstelling>
```

De host staat vast. Er worden geen redirects gevolgd, aanvragen hebben een time-out en responsen zijn begrensd. Gelijktijdige aanvragen delen één upstreamaanvraag en de status wordt kort gecachet, zodat meerdere meekijkende collega's niet ieder apart Sonoran belasten.

Bij een fout wordt een korte melding getoond. Eerder geslaagde gegevens kunnen zichtbaar blijven met een verouderingsmelding en het tijdstip van de laatste geslaagde controle. Zo'n oude radiosnapshot kan niet als nieuwe ploeg worden overgenomen en telt niet mee in de extra radiotellingen. De browser behandelt een antwoord na 45 seconden zonder geslaagde verversing als verouderd, gemeten met de eigen klok. De samenvatting wordt direct na iedere radioverversing bijgewerkt. API-sleutels, autorisatieheaders, ruwe technische identiteiten en foutteksten van Sonoran worden niet naar de browser doorgestuurd.

Zonder beide instellingen geeft de route een niet-geconfigureerde status terug. Een geslaagde lege lijst betekent nul radioverbindingen. Testresultaten met gesimuleerde Sonoran-responsen bewijzen de verwerking en afscherming; echte communitytoegang moet met de ingestelde waarden op TEST worden gecontroleerd.

## Uitgevoerde controles

Alle 163 repositorytests en de syntaxcontroles slagen. De radiotests controleren onder meer politierechten, afscherming van de sleutel, naamherkenning, dubbele roepnummers, caching, time-outs/foutresponsen, begrensde responsen en herstel na een storing. Negen tellingtests controleren de combinatie van dienstbord en radio, koppelploegen, numeriek gelijke roepnummers, volledige categorieën, pauzes, actieve meldingen, uitdienstmeldingen, verouderde gegevens en behoud van de invoer. De browsercontroles gebruiken tijdelijke opslag, een gesimuleerde aanmelding en gesimuleerde Sonoran-responsen. De werkelijke app weigert anonieme radio-aanvragen met HTTP 401.

De gebruiker heeft de bestaande Sonoran-koppeling op TEST werkend bevestigd. De nieuwe telling is met gesimuleerde radiogegevens gecontroleerd; de ontwikkelomgeving heeft geen echte Community API Key. Een succesvolle Git-push bewijst geen afgeronde Render-uitrol; controleer na die uitrol de communityverbinding en tellingen in het portaal.
