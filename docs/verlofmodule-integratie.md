# Verlofmodule – veilige integratie in BelgiëPD

Deze integratiebranch is gebaseerd op `main` en voegt de verlofmodule uit
`feature/verlofmodule-test` toe. De bestaande testpersoneel-functie uit `main`
en de veiligheidscontrole op `FIREBASE_PROJECT_ID=belgiepd-test` zijn behouden.

## Toegevoegd
- Centrale verlofregels en serverroutes in `src/leave-*.js`
- Verlofbeheerpagina en directe link in de hoofdbalk
- Gerichte tests van het verlofrechtenmodel

## Veiligheid en activering
- Google Firebase-authenticatie en server-side allowlist blijven verplicht.
- `BPD_ENABLE_LEAVE_WRITES` blijft standaard uit. Activeer niet op productie
  voordat authenticatie, bevoegdheden en Firestore-datastromen getest zijn.
- Multi-hulpdienstaccounts hebben expliciete `departmentRoles` nodig, bijvoorbeeld
  `{"departments":["politie"],"role":"middenkader",
  "departmentRoles":{"politie":"middenkader"},"discordId":"..."}`.
- Een eenmaal ingestelde rol voor één hulpdienst geldt niet automatisch voor andere diensten.
- `BPD_TEST_FIXTURES=true` werkt alleen met `FIREBASE_PROJECT_ID=belgiepd-test`.

## Vóór samenvoegen naar main
1. `npm ci` gevolgd door `npm test` en `npm run check`.
2. Test gebruikersauthenticatie, aanvragen, goedkeuring en machtigingen op Render testserver.
3. Controleer Firestore-rechten, indexen, gegevensminimalisatie en terugvalplan.
4. Controleer dat main en integratiebranch niet tussentijds gewijzigd zijn.
5. Laat schrijven uitgeschakeld op productie tot alle controles geslaagd zijn.

Let op: dit is een conceptintegratie, geen bewijs van succesvolle runtime-tests of deployment.
