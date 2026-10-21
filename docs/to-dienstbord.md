# TO-dienstbord

De portaalmodule op `/to-dienstbord.html` vervangt de losse TO-prototypeopslag. De module bevat een lopende TO-dienst, eenheden en koppelploegen, beschikbaarheid, meldingen met ploegtoewijzingen, accountgebonden overnames en een dienstarchief. Het dashboard bevat een navigatielink; Discord-aanmelding keert terug naar het dienstbord.

## Gebruik

1. Open **TO-dienstbord** vanuit het beheerportaal en meld aan met je bestaande account.
2. Start of neem een dienst over met je **geverifieerde roepnummer**: het portaal vergelijkt jouw geauthenticeerde Discord-ID met `personId` in de politiewerkgeverslijst en vult bijvoorbeeld `930` vooraf in. Als een kaderlid een tijdelijke aanmelding tussen 100 en 199 heeft geverifieerd in `bpd_callsign_requests`, kan dat nummer ook gebruikt worden. Bij een geldig gekoppeld roepnummer bewaart de server dat nummer, ook als iemand probeert zelf een andere weergavenaam door te sturen. De toegang blijft uitsluitend bepaald door de bestaande Discord/Firebase-accountrechten en de eigen operator-UID. Een lopende dienst wordt nooit automatisch overgenomen.
3. Herkende live Sonoran-ploegen tellen automatisch mee bij ploegen in dienst en beschikbaarheid. Voeg een ploeg toe met een operationele categorie en één of twee bemanningsleden om haar status en meldingen te beheren. Bij koppelrijden bepaalt het hoogste numerieke roepnummer de ploegnaam; de radio's van beide leden tellen samen één ploeg.
4. Maak meldingen aan, koppel ploegen en werk de status bij. Een ploeg op een actieve melding telt als bezet, ook wanneer haar handmatige beschikbaarheid aanstaat.
5. Een bevoegde collega klikt op **Dienst overnemen** en bevestigt in een pop-up **Ja, dienst overnemen**. Toestemming van de vorige TO is niet nodig; na de bevestiging wordt de overname geregistreerd. Zo werkt dit ook als de vorige TO plots offline is.
6. Rond actieve meldingen af voordat je de dienst afsluit. De server bewaart het archief en beëindigt de lopende dienst in één transactie. Vertrokken ploegen blijven in de diensthistoriek behouden.

Het bord wordt periodiek ververst. Een verbroken verbinding of versieconflict wordt zichtbaar gemeld; een mislukte wijziging wordt niet als opgeslagen gepresenteerd. Archieven zijn alleen-lezen en kunnen als JSON worden geëxporteerd.

De radio- en ploegenlijsten zijn gegroepeerd onder Politie, Brandweer, Ambulance en Depannage. **Ambulancedienst** herkent aanvullend de zeven operationele callsigngroepen `DIRMED`, `HARTS`, `HVPK`, `HAMB`, `ARTS`, `VPK` en `AMB`, elk met een positief numeriek roepnummer van één tot vijf cijfers. Sonoran-labels in de vorm `HAMB-12`, `HAMB 12`, `HAMB12` en `HAMB - 12` vallen daardoor onder Ambulance; de prefixen worden afzonderlijk herkend (bijvoorbeeld HARTS is niet ARTS). Eerdere categorieën zoals `AMBULANCE`, `MUG`, `PIT` en `DIR-MED` blijven beschikbaar. Een roepnaam zonder geldig nummer wordt wel herkend als categorie, maar is niet automatisch als eenheid toe te voegen. De dienstindeling geeft geen personeels- of Discord-rechten. SANTO en de andere politiecategorieën, inclusief `CANINE`, staan onder Politie. `STAG` is een brandweercategorie, terwijl `STAGE` en `ZW` (Ziekenwagen) bij Ambulance horen. Beide worden los van elkaar herkend, ook met numerieke suffix en optioneel koppelteken (`STAG-120`, `STAGE620`); `CANINE` ondersteunt deze vormen eveneens. **Brandweer** omvat de prefixes `BWM`, `BWV`, `BAMBU`, `BWAMBU`, `BW-AMBU`, `KORP`, `SERG`, `ADJ`, `LT`, `KAP`, `MAJ`, `KOL`, `ZONE`, naast de bestaande brandweercategorieën (`ZONE-COMM` blijft afzonderlijk). **Depannage** omvat alle radiolabels die beginnen met `LSRA` of `DEPK`; bestaande specialistische LSRA-categorieën blijven afzonderlijk zichtbaar. Voor deze nieuwe prefixen wordt een roepnummer van 1–5 cijfers herkend met koppelteken, spatie of direct aangehecht (bv. `BWV620`, `KAP-52`, `DEPK 120`). Een LSRA/DEPK-label met alleen een tekstsuffix blijft zichtbaar onder Depannage, maar wordt zonder geldig numeriek roepnummer niet automatisch als inzetbare ploeg geteld. Binnen de categorieën lopen de roepnummers numeriek op. Het categoriefilter kan een hele hulpdienst of één categorie tonen. Niet-herkende radiolabels blijven zichtbaar onder Overige.

## Automatische TO-identiteit en tijdelijke roepnummers

- Voor een bestaande politiemedewerker wordt het roepnummer **alleen** afgeleid uit een personeelsrecord waarvan `personId` exact gelijk is aan de Discord-ID die aan het aangemelde account verbonden is. De standaard TO-benaming is dan bijvoorbeeld `930`. Bij tegenstrijdige matches wordt niet automatisch gekozen.
- Het personeelsbestand kan tijdelijk niet beschikbaar zijn: het dienstbord blijft bruikbaar met een handmatige TO-weergavenaam, maar behandelt die niet als een geverifieerde identiteit.
- Een door het kader **geverifieerde** aanvraag in `bpd_callsign_requests` met dezelfde Discord-ID en een tijdelijk roepnummer binnen `100–199` kan eveneens als TO-weergavenaam worden ingevuld. Alleen een Discord-rol, zelf gekozen nickname of niet-geverifieerde aanvraag is niet genoeg.
- **008 = Belga (BEHEER)**, de bestuurder van de BelgiumPD-server. Dit is uitdrukkelijk **geen tijdelijk roepnummer** en wordt als `BELGA · BEHEER` aangeduid bij politieradioploegen en op het TO-dienstbord. Het label is uitsluitend informatief: Discord-/portaalrechten blijven gebaseerd op de geverifieerde account en de autorisatieregels, niet op de roepnummertekst.
- Nieuwe agenten met een tijdelijk roepnummer binnen **100–199** verschijnen als **TIJDELIJK**. Ze hoeven nog geen vaste personeelsfiche te hebben om via actuele Sonoran Radio of handmatige invoer als ploeg te verschijnen. Zowel `SANTO-008` als `SANTO-130` blijven bruikbare, afzonderlijke ploegen.
- Een handmatige, niet-geverifieerde TO-naam blijft mogelijk wanneer er geen betrouwbare koppeling bestaat, maar verandert nooit de eigenaar of de autorisatie van de dienst. De beveiligde operator-UID wordt afzonderlijk vastgelegd.
- Dienst starten en dienst overnemen blijven expliciete acties. Het systeem neemt bestaande lopende diensten niet automatisch over bij aanmelding.

## TO-dienstovername na bevestiging door de overnemende collega

- Een collega met minstens middenkaderrechten voor Politie klikt op **Dienst overnemen**. De huidige TO hoeft niet online te zijn of goed te keuren. Ook na een pc-crash kan de lopende dienst daardoor onmiddellijk worden voortgezet.
- De **overnemende collega zelf** ziet een pop-up **‘Ben je zeker dat je deze dienst wilt overnemen?’**, met de naam/het roepnummer van de huidige TO, zijn eigen geverifieerde roepnummer of weergavenaam, en de melding dat de vorige TO de bediening verliest.
- **Annuleren** of het venster sluiten wijzigt niets. Pas **‘Ja, dienst overnemen’** voert de overname uit. De server accepteert hiervoor uitsluitend een bevoegde aangemelde gebruiker met de expliciete bevestigingswaarde `JA_OVERNAME`, en controleert de actuele dienstrevisie.
- De nieuwe eigenaar wordt met zijn geverifieerde UID opgeslagen; het tijdstip, de vorige en nieuwe TO, de bevestiging en beide UID's komen in de overdrachtshistoriek. Bestaande ploegen, actieve meldingen en dienstgegevens blijven ongewijzigd.
- De oude aanvraag-, goedkeurings- en noodprocedure wordt niet meer gebruikt. Achtergebleven verzoeken van de vorige versie worden bij de eerstvolgende bevestigde overname opgeruimd.

## Compacte statusknoppen en eigen meldingssneltoetsen

Elke opgeslagen ploeg toont vier onafhankelijke knoppen: **↗ Onderweg**, **● Ter plaatse**, **Ⅱ Pauze / NB** en **✓ Beschikbaar**. De TO kan rechtstreeks elke gewenste status kiezen, zelfs **Ter plaatse → Pauze**, **Pauze → Onderweg** of **Ter plaatse → Beschikbaar**, zonder tussenliggende stappen. De knop **Status wissen** is verwijderd. De hoofdkaart is niet zelf klikbaar. De geselecteerde status is duidelijk gemarkeerd en de bestaande blauwe lichtindicatie blijft knipperen bij Onderweg en continu branden bij Ter plaatse. Een statuswijziging wordt atomair op het gedeelde dienstbord opgeslagen en in gekoppelde actieve meldingen gelogd. **NB via Sonoran blijft leidend**: het bord laat een radio-NB niet handmatig op beschikbaar/onderweg/ter plaatse zetten. Het wisselen van status ontkoppelt **nooit automatisch** een actieve melding; een ploeg die nog gekoppeld is, blijft volgens de operationele telling bezet tot een TO ze bij de melding ontkoppelt of de melding afsluit.

De knop **★ Titel als sneltoets opslaan** in het nieuwe/bewerkbare meldingsformulier en **★ Opslaan als sneltoets** bij een bestaande melding creëren een **gedeelde, permanente meldingssneltoets**. Enkel de titel wordt overgenomen; postcode en de beschrijving van een concrete oproep worden niet bewaard in het sjabloon. Daardoor komt geen incident-specifieke adres- of persoonsinformatie in de herbruikbare sneltoets terecht.

Alle opgeslagen sneltoetsen verschijnen onder **★ Opgeslagen sneltoetsen**, ook na een dienstafsluiting of bij een nieuwe TO. Een klik opent een nieuwe melding met de titel vooraf ingevuld, maar zonder postcode of andere ingevulde incidentgegevens. De huidige TO kan een sneltoets verwijderen met de aparte **×**-knop en een bevestigingsvenster. De sneltoetsen worden afzonderlijk van het dienstarchief opgeslagen in Firestore onder `bpd_to_incident_shortcuts/politie` en kennen een maximum van **30 stuks**. Alleen de huidige bevoegde TO kan toevoegen of verwijderen; leesbevoegde collega's mogen ze wel bekijken. Dubbele titels, ongeldige waarden en conflicterende wijzigingen worden server-side geweigerd. Bestaande meldingen worden nooit veranderd door het verwijderen van een sneltoets.

## Ontkoppelen rechtstreeks op de ploegkaart

Wanneer een opgeslagen ploeg aan minstens één **actieve melding** gekoppeld is, krijgt ze naast **Uit dienst** de knop **↗ Ontkoppelen**. De knop is niet zichtbaar bij ploegen zonder actieve meldingskoppeling. Dit is iets anders dan de ploeg uit dienst halen.

- Bij **één** melding toont een bevestigingsvenster het meldingsnummer en de titel, bijvoorbeeld `M-002 · OVERLAST`.
- Bij **meerdere** gelijktijdige meldingen toont het venster een verplichte keuzelijst. De TO ontkoppelt uitsluitend de geselecteerde melding en laat de overige koppelingen intact.
- De TO bevestigt expliciet. De server gebruikt dezelfde beveiligde `detach-team`-actie als de meldingsdetails, controleert de eigenaar en revisie en bewaart de ontkoppeling in het meldingslogboek.
- De melding blijft open en blijft in de historiek. Bij het verwijderen van de **laatste** actieve koppeling wordt een nog actieve uitrukfase (`onderweg` of `ter-plaatse`) gereset. Een zelf gekozen pauzestatus blijft behouden. De ploeg blijft **in dienst**.
- Voor een andere status dan `Pauze / NB` blijft een actuele Sonoran-NB leidend en kan de TO deze niet via de beschikbaarheidsknoppen overschrijven.

## Vrij kiezen van ploegstatus en blauw zwaailicht

De vier statussen zijn zelfstandig te kiezen via een eigen knop op de ploegkaart:

- **Onderweg:** knipperend blauw indicatielicht; de ploeg telt niet als beschikbaar.
- **Ter plaatse:** continu blauw indicatielicht; rechtstreeks te selecteren, zonder eerst Onderweg te kiezen.
- **Pauze / NB:** handmatige pauze of niet-beschikbaarstatus, ook rechtstreeks te kiezen vanaf Onderweg of Ter plaatse.
- **Beschikbaar:** verwijdert de handmatige pauze en de uitrukfase in één handeling. Bij een nog actief gekoppelde melding blijft de ploeg wel als bezet meetellen tot ontkoppeling of afhandeling; de ploegkaart waarschuwt daarvoor.

De huidige TO moet alle wijzigingen uitvoeren met het eigen account. Het gekozen label blijft zichtbaar bij andere TO's en de wijziging wordt in de actieve gekoppelde meldingen geregistreerd. Het licht bestuurt geen werkelijke voertuigverlichting. Met de instelling voor minder animatie blijft de tekst zichtbaar zonder knipperbeweging. De server controleert de rechten, geldige statuswaarde en actuele dienstrevisie.

## Extra sneltoetsen voor meldingen

De oorspronkelijke meldingsknoppen **ANPR, AGRESSIE, VKO, BRAND, TAKELING, DIEFSTAL, VERDACHTE SITUATIE** en **MEDISCHE BIJSTAND** blijven zichtbaar.
Met **＋ Meer meldingen** kunnen ook **OVERLAST, WONINGINBRAAK, VECHTPARTIJ, VERMIST PERSOON, ACHTERVOLGING, VERDACHT VOERTUIG, VERKEERSHINDER** en **BEROVING** worden gekozen. Elk van deze knoppen opent alleen het formulier met de titel vooraf ingevuld. Postcode en eventuele omschrijving moeten door de TO worden gecontroleerd; een sneltoets koppelt niet automatisch een ploeg of rondt de melding af.

## Snelle TO-werkstroom
- Sonoran blijft een read-only bron: herkende radiogebruikers verschijnen bovenaan, en nog niet opgenomen radioploegen komen in **Nog op te nemen** met een korte aankomstmarkering. Onbekende radiolabels worden uit de operationele lijst verborgen, maar blijven in het totale aantal radioverbindingen meetellen.
- Met **＋ Op bord** of slepen naar de dropzone slaat de huidige bevoegde TO een **herkend categorie/nummer als één ploeg** op. De radioweergavenaam wordt als voorlopig radiolabel bewaard, niet als geverifieerd personeelsdossier. Bij een Sonoran-koppeldienst met hetzelfde roepnummer blijft het één opgeslagen eenheid, zonder gefingeerde tweede persoonlijke roepnummer.
- Met **－ Uit dienst** kan dezelfde TO via bevestiging de ploeg beëindigen. Actieve meldingen verhinderen dit totdat de ploeg ontkoppeld of de melding afgerond is. Radio-afmeldingen verwijderen nooit automatisch een opgeslagen ploeg.
- Ploegkaarten gebruiken een groene achtergrond voor beschikbaar, oranje voor op melding en rood voor niet beschikbaar, met bijbehorende tekstlabels.
- Een nieuwe melding kan starten met de snelle knoppen **ANPR**, **AGRESSIE**, **VKO**, **BRAND**, **TAKELING**, **DIEFSTAL**, **VERDACHTE SITUATIE** en **MEDISCHE BIJSTAND**. Die vullen alleen de titel vooraf in: postcode en omschrijving worden vóór opslaan gecontroleerd.

## Alleen radiogebruikers die werkelijk in een kanaal zitten
- Sonoran `connectedUsers` omvat ook aangemelde gebruikers die nog niet op een zend- of scankanaal zitten. Het TO-dienstbord verwerkt vanaf deze versie **alleen** gebruikers met minimaal één geldige kanaal-ID uit `metadata.state.primaryChId` of `metadata.state.scannedChIds` (en `primaryChIds` indien aanwezig).
- `roomId` identificeert een Sonoran multi-server kamer en **mag niet als kanaal-ID worden getoond of meegeteld**.
- Radiogebruikers zonder actieve kanaaltoewijzing verdwijnen uit de operationele lijst, de nieuwe-aansluitingenlijst en de extra radioploegtelling. Het aantal alleen verbonden gebruikers is afzonderlijk zichtbaar.
- De server geeft uitsluitend geschoonde, in een kanaal actieve gebruikers terug. Een radiogebruiker die het kanaal verlaat, wordt niet automatisch uit een reeds handmatig opgeslagen TO-ploeg verwijderd; de TO beslist zelf over het beëindigen van de dienst.
- Bij ontbrekende kanaalmetadata wordt niemand ten onrechte als actieve radioploeg aangenomen; controleer in dat geval of Sonoran de verwachte metadata doorstuurt.

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
