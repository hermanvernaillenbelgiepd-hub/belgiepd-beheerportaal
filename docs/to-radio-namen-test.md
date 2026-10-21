# TO Radio labels en veilige naamcorrectie — TEST

## Herkenning

- Politie: `MONITOR`, `TO`, `T.O.`, `COBRA`, `REPA`.
- Opleiding: `OPLEIDING` krijgt een afzonderlijke groep *Opleiding*, buiten de politieploegen. Een opleidingslabel wordt niet automatisch als operationele ploeg geïmporteerd.
- Bestaande brandweer-, ambulance- en depannage-prefixen blijven ongewijzigd.
- Niet-genummerde radiofunctielabels zijn zichtbaar, maar worden niet automatisch als ploeg ingeschreven. Herkenning is nooit een bewijs van identiteit of autorisatie.

## Handmatige naamscorrectie

- Alleen portaalactoren met bestaande, expliciet goedgekeurde politiedienstbeheerders-/TO-rechten kunnen de knop **Naam aanpassen** zien.
- Alleen een op dat moment verbonden gebruiker met een **stabiele upstream Sonoran identity** kan handmatig een correctie krijgen.
- Een correctie is uitsluitend een `portalAlias`. Het originele Sonoran-radiolabel, categorie, nummer, koppelstatus, radiokanaal, NB-status en Sonoran-account blijven identiek.
- Gewijzigde namen worden met actor-UID, Discord-ID en een append-only auditgeschiedenis in `bpd_radio_label_overrides` en `bpd_radio_label_audit` bijgehouden.
- Opslag blijft **UIT** totdat `FIREBASE_PROJECT_ID=belgiepd-test` én `BPD_ENABLE_TO_RADIO_LABEL_WRITES=true` veilig ingesteld zijn en de daadwerkelijke afgescheiden Firestore-database is gecontroleerd. MAIN en Sonoran worden niet gewijzigd.
- Het veld legen verwijdert alleen de correctie; het oorspronkelijke radiolabel wordt opnieuw zichtbaar. Bij uitval van de naamopslag blijft de gewone live Sonoran-radiolijst beschikbaar.

## Technisch mogelijk: portaal → Sonoran

Sonoran Radio heeft een documenteerde Set User Display Name API voor een gebruikersaccount-UUID en de v2 client heeft de methode `setUserDisplayNameV2`. De huidige TO-koppeling gebruikt alleen de API voor **lezen** van verbonden radiogebruikers en verbergt upstream identiteiten terecht voor browsers.

Voor tweerichtingsverkeer is nog vereist:

1. Een **geverifieerde** koppeling: eigen Discord-ID → portaalpersoneelsfiche → Sonoran account UUID (niet op een willekeurige radioweergavenaam of een los roepnummer matchen).
2. Aparte bevoegdheid voor wijzigingen aan de Sonoran-community én serverbeveiligde API-sleutel.
3. Expliciete bevestiging vóór externe wijziging, met actorlog, oude/nieuwe naam, API-resultaat en veilige foutafhandeling.
4. Verschillende TEST- en MAIN-radiocommunities of een geïsoleerde ontwikkel-API voordat de functie op TEST wordt getest.
5. Bescherming tegen automatische overschrijving vanuit FiveM/ACE/CAD/Discord nadat het portaal de naam heeft gewijzigd.

De externe synchronisatie is in deze wijziging **niet ingeschakeld of uitgeprobeerd op de echte Sonoran Radio-community**.
