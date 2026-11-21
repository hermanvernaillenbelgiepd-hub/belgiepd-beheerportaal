# BelgiumPD — herstelplan voor de portaaloptimalisatie (21 november 2026)

## Doel en uitgangspunten

Een gebruikersinterface wijzigen is **niet** hetzelfde als Firestore-dossiers veiligstellen.
Geen wijziging aan MAIN wanneer (a) de betrokken rechten niet getest zijn, (b) de
verwachte codeversie op TEST niet bevestigd is of (c) een datamigratie of
bulkverwijdering gepland is zonder een **gecontroleerde, herstelbare** databaseback-up.

Blijvend uitgangspunt: technisch beheer kan alle diensten beheren via een apart,
geverifieerd technisch profiel. Andere rollen blijven door de server gecontroleerd
volgens hun dienst, kader en expliciet verleende machtigingen. De UI mag nooit
zelf een extra bevoegdheid impliceren.

## 1. Terugzetpunten van code (gemaakt vóór wijziging)

| Omgeving | Branch | Bewaarde commit (21-11-2026) |
| --- | --- | --- |
| MAIN | `safety/main-pre-optimalisatie-20261121` | `74726c7f54465450383442a3a7992dca9a2de05b` |
| TEST | `safety/test-pre-optimalisatie-20261121` | `e124d760dc00c64faacb11070f6a89f268ff717f` |

Deze branches bewaren **code**, geen Firebase-database of Render-secrets.
Maak bij elke volgende fase een nieuw checkpoint met de verwachte commit-SHA.
Bewaar de koppeling van commit, branch, Render-service en deploy-ID in het changelog.

- TEST: Git-branch `feature/verlofmodule-test`, Render-service `srv-dbampoqjnfac738b1tsg`.
- MAIN: Git-branch `main`, Render-service `srv-dbaj7njbc2fs73bjt4fg`.
- Auto-deploy staat aan: een push naar de bijbehorende branch publiceert automatisch.
  Start **geen** bijkomende handmatige Render-deploy na die push.

### Code terugzetten bij een defect

1. Noteer de huidige MAIN/TEST commit, het incident en eventuele ingediende dossiermutaties.
2. Zoek de laatste goede commit via GitHub en de safety-branch.
3. Zet de ongewenste wijziging terug met een **nieuwe revert-commit** op de betrokken branch
   (geen force-push/branch-reset, zodat andere tussentijdse wijzigingen en audit behouden blijven).
4. Controleer de automatische Render-publicatie en vergelijk
   `GET /api/health` met de verwachte `deployment.commit` en `deployment.branch`.
5. Controleer in TEST/MMAIN de getroffen workflow met bevoegde en niet-bevoegde gebruikers.
6. Maak daarna een gerichte herstelwijziging en publiceer opnieuw volgens TEST → MAIN.

Een Git-revert herstelt nooit automatisch Firestore-data, sessies of reeds uitgevoerde
personeelsbewegingen. Daarvoor geldt het volgende databaseprotocol.

## 2. Firestore: vóór muterende migraties expliciet controleren

**Op het moment van dit document is NIET vastgesteld of de MAIN- en TEST-databases
effectief een actieve, herstelbare back-upplanning of point-in-time recovery (PITR) hebben.**
Er zijn geen databasesnapshots aangemaakt tijdens de codewijziging van 21-11-2026.

De bevoegde Firebase/Google Cloud-projectbeheerder moet PER project:

1. Open Google Cloud Console → Firestore → Databases → Disaster recovery.
2. Controleer de juiste project-ID, database-ID (meestal `(default)`), locatie,
   bestaande dagelijkse/wekelijkse back-ups, bewaartermijn en eventuele PITR.
3. Richt zo nodig beheerde dagelijkse back-ups en geschikte bewaartermijn in.
   Overweeg PITR voor recente fouten; controleer beschikbaarheid en kosten.
4. Leg vóór elke datamigratie de exacte herstelbare back-up en het tijdstip vast.
5. Proefherstel een back-up **naar een aparte database** en valideer dossier-aantallen,
   persoonsgegevens, auditlogs en indexen, zonder MAIN te overschrijven.
6. Verifieer dat de herstelprocedure daadwerkelijk uitvoerbaar is met de toegewezen IAM-rechten.
7. Voer **pas daarna** de goedgekeurde mutatie uit. Bewaar incident-/auditreferenties.

Officiële documentatie:
- https://firebase.google.com/docs/firestore/backups
- https://firebase.google.com/docs/firestore/disaster-recovery
- https://firebase.google.com/docs/firestore/use-pitr

Een herstel van een volledige back-up naar een nieuwe database is **geen**
automatische één-klikactie om één dossier in MAIN terug te draaien.
Voor gericht dossierherstel: valideer bronidentiteit, wijzigingen sinds de back-up,
onderlinge koppelingen, tijdstippen en audit vóór het gecontroleerd terugschrijven.

Geef nooit gedeelde Firebase-serviceaccountsleutels, gebruikersgegevens of back-upbestanden
door via GitHub, Render-logs of een openbaar dashboard.

## 3. Wijzigings- en verwijderbeleid

- Bij gewone visuele wijzigingen: geen personeelsdossiers, officiële status of autorisatievelden wijzigen.
- Bij dossierwijzigingen: authorisatie op de server, verplichte motivering, audit vóór/na,
  correcte actor en tijdstip; defensieve revisiecontrole tegen gelijktijdig overschrijven.
- Bij verwijderen: geef voorkeur aan archiveren/soft delete en herstelfunctie.
  Definitief wissen alleen met expliciete bevoegdheid, gecontroleerde back-up en verwijderaudit.
- Technisch beheer: technisch profiel afzonderlijk geverifieerd; dienstoverschrijdende
  toegang waar de server dat expliciet toelaat. Voeg ontbrekende rechten gericht toe,
  niet door de hele API onbeperkt te openen.
- Sollicitaties: eigen afgeschermde gegevens, los van personeelsdossiers. Toekenning
  van Discord-rollen of dossierbevoegdheden mag nooit automatisch volgen uit acceptatie.

## 4. Minimaal uitrolbewijs per punt

- TEST Git-SHA genoteerd; Render TEST status LIVE met dezelfde SHA.
- Unit-/regressietests van functie, oude routes en autorisaties gecontroleerd.
- Test met de werkelijke bevoegde gebruikersrollen (zonder productie-mutaties).
- MAIN Git-SHA en goede vorige commit vastgelegd.
- MAIN Render status LIVE met dezelfde SHA; geen 401/403-bypass of verlies van velden.
- Wanneer GitHub Actions onbetrouwbaar is: vermeld dit expliciet; een Render-status
  `live` vervangt de mislukte testcontrole **niet**.

## 5. Specifiek: groepsleider en instructeur (optimalisatiepunt 12)

Het oudere `rollenbeheer.html` stuurt bij de organogram-save geen veld
`functionOverrides` mee. De backend bewaart daarom binnen dezelfde Firestore-transactie
de bestaande expliciete selectie wanneer dit veld **ontbreekt**.
Expliciet een lege selectie versturen via het nieuwe beheerformulier mag de
keuze wel bewust verwijderen. Bij verwijderen van een specialisatie die nog een
expliciete groepsfunctie heeft, weigert de oude beheerroute de actie.
Het echte volgende veld wordt gelogd; er wordt geen rol of dossierbevoegdheid toegekend.

## 6. Blokkade voor toekomstige grote optimalisaties

- Bij ontbrekend aantoonbaar Firestore-herstelpunt: **geen** bulkverwijdering,
  grote dossierschemawijziging of datamigratie op MAIN.
- Bij niet-geslaagde TEST-verificatie: **geen** MAIN-publicatie van die wijziging.
- Bij codecorrectie zonder datamigratie: code-herstelpunt, testcontrole en
  gerichte gecontroleerde MAIN-publicatie zijn vereist.
