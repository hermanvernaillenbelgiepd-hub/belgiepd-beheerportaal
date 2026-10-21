# BelgiumPD — vaste roepnummers 200–299 en politiepersoneelsdossiers (TEST)
 
## Scope en werking

- Beide aanvraagroutes zijn beschikbaar: `/roepnummer-aanvragen.html` met een **persoonlijk geverifieerde Discord-login**, en `/roepnummers.html` voor bevoegd politiekader.
- Kandidaten kunnen een nog vrij voorkeursnummer aangeven; dit is **geen reservering**. Het bevoegde kader bevestigt de aanvraag via `/info member`: ten minste **10 uur en 5 volledige dagen**. De bot is nog niet rechtstreeks aangesloten, dus deze data zijn **handmatig geverifieerd**, niet automatisch bewezen.
- Middenkader kan registreren en controleren; **officierenkader of korpsleiding** (in de specifieke politiedienst) kan afwijzen of definitief goedkeuren. Een beheerder met expliciete beheerdersrechten in politie kan ook optreden.
- De kandidaat kan uitsluitend zijn **eigen** aanvraag lezen en indienen op basis van Firebase Discord custom-auth + verse, bij de guild geverifieerde Discord metadata. Er worden geen kader- of personeelsrechten aan die login verleend. Geblokkeerde gebruikers kunnen niet via de aanvraagpagina aanmelden.
- Bij goedkeuring wordt binnen één Firestore-transactie een nummer (200–299) geclaimd, plus personeelsfiche (`bpd_personnel_created`), politiedossier (`bpd_staff_dossiers`), minimaal intern dossierrecord (`bpd_cases`), twee append-only auditregels, en status `approved`. Toekenning start als `Agent` en `In opleiding`, zonder automatische Discord-rollen.
- Alle claims gebruiken ook `bpd_personnel_call_claims` (dezelfde sleutel als nieuw personeelsbeheer) en controleren `bpd_callsign_reservations` voor compatibiliteit met eerder verwerkte aanvragen. Gelijktijdige goedkeuring van hetzelfde nummer wordt in een transactie geweigerd.

## Migratie: Sheets alleen lezen

- **Nergens** in de nieuwe aanvraagmodule wordt de Google Sheets API aangeroepen om te schrijven. De oude `performPoliceSync` wordt niet meer aangeroepen door `src/callsign-routes.js`.
- Bestaande Google Sheets-politiegegevens worden voorlopig **alleen via de bestaande gedeelde `getSnapshot({forceRefresh:true})`-leesbron** gecontroleerd op reeds bezette nummers, Discord-ID en naam. Als de bron niet beschikbaar of verouderd is, wordt goedkeuring geweigerd (fail closed).
- Een nummergegeven in een externe Sheet kan ondanks hercontrole tussendoor veranderd worden, zolang Sheets nog apart door beheerders bewerkt kan worden. Voor definitieve migratie: eerst schrijfvergrendeling op de legacy administratie, gegevensreconciliatie, en reserveer alle bezette nummers in Firestore. Na de migratie kan ook deze laatste read-only Sheets-afhankelijkheid verwijderd worden.

## Activeren — NIET automatisch
 
De code staat uitsluitend in de branch `feature/verlofmodule-test`. De volgende booleans moeten bewust geconfigureerd en getest worden op de TEST-service:

- `BPD_ENABLE_CALLSIGN_REQUESTS=true` — zowel zelfaanvragen als kaderinstroom.
- `BPD_ENABLE_DISCORD_PORTAL_LOGIN=true` — vereist voor zelfaanvragen; Discord OAuth en Firebase moeten correct geconfigureerd zijn.
- `BPD_ENABLE_PORTAL_CALLSIGN_APPROVALS=true` — nieuwe toekenningsflow. **Standaard uit**, bij ontbreken hiervan is definitieve goedkeuring niet beschikbaar.
- `BPD_ENABLE_STAFF_DOSSIERS=true` — personeelsdossiers moeten beschikbaar zijn voor het kader.
- `BPD_PRODUCTION_PERSONNEL_DATA=true` — uitsluitend in een gecontroleerde niet-fixture Firestore-projectconfiguratie, of gebruik de reeds begrensde TEST-fixtureconfiguratie (`belgiepd-test`). Hiermee worden nieuwe Firestore-fiches zichtbaar in de gedeelde personeelsweergave.

**TEST-schrijfacties zijn in de code expliciet geblokkeerd tenzij `FIREBASE_PROJECT_ID=belgiepd-test`.** Bevestig daarnaast dat het bijbehorende serviceaccount ook daadwerkelijk toegang heeft tot de gescheiden testdatabase. TEST en MAIN blijven anders logisch gescheiden qua code maar zouden dezelfde database kunnen muteren. Schrijf niets in een gedeelde productie-Firestore vanuit TEST.

Het bestaande `BPD_ENABLE_SHEETS_SYNC` wordt in deze flow genegeerd en mag uit blijven. Er is geen productie-release of backfill uitgevoerd.

## Functionele acceptatie

1. Kandidaat zonder kaderrechten meldt aan via Discord, vraagt persoonlijk een nummer aan, ziet alleen eigen aanvraag.
2. Bevoegd kader ziet die aanvraag, dient desgewenst ook namens iemand anders een aanvraag in, controleert via botgegevens.
3. Basiskader kan niets goedkeuren; middenkader kan controleren maar niet definitief toekennen.
4. Een bevoegde officier controleert het nummer, bevestigt, krijgt een Firestore-personeelsfiche en politiedossier in dezelfde transactie.
5. Opnieuw goedkeuren, een tweede aanvraag met dezelfde Discord-ID, bezette nummers en twee gelijktijdige claims veroorzaken een conflict; geen half aangemaakte dossiers.
6. Bestaande Sheets worden voor en na identiek gevonden, geen Sheets-schrijfflags nodig.
7. Personeelslijst en personeelsdossier tonen de nieuwe medewerker alleen wanneer de Firestore-datalezing is ingeschakeld.
8. Firestore-dossiers en mutaties zijn alleen toegankelijk voor bevoegd kader. Bevestig dit met echte TEST-accounts voordat je nummeruitgifte inschakelt.
