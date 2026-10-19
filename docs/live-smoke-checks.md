# Automatische live-controles van MAIN en TEST

De GitHub Actions-workflow `.github/workflows/live-smoke.yml` wordt gestart bij iedere push naar `main` en `feature/verlofmodule-test`. Via GitHub Actions → **BelgiumPD Live Security Smoke Checks** kan de controle ook handmatig gestart worden.

### Wat wordt getest?
- De geconfigureerde Render-site draait daadwerkelijk de verwachte GitHub-commit én de verwachte branch volgens `GET /api/health`.
- De afzonderlijke burgerdossier- en dossiercentrumvlaggen staan aan en de HTML-pagina's zijn bereikbaar.
- De clientconfiguratie is aanwezig; de TEST-omgeving verwijst alleen naar `belgiepd-test`.
- Niet-aangemelde bezoekers krijgen HTTP 401 voor de beschermde personeelslijst, het dossiercentrum en persoonlijke burgergegevens.
- Een registratieverzoek zonder account wordt geweigerd. Geen login, wachtwoord, Discord-token, database- of personeelsgegevens zijn nodig.

### Wat wordt niet getest?
- Geen echte Discord OAuth-aanmelding of Firestore-schrijftransactie.
- Geen willekeurige fake burgers, sollicitaties of gepromoveerde medewerkers.
- Geen FiveM-telemetrie zonder een vertrouwde serverbron.
- Geen volledige autorisatiecontrole voor alle kaderrangen; dit vereist ingelogde testaccounts.

### Controleverloop
De smoke job wacht tot Render de bij de push horende SHA live toont. De maximaal toegestane wachttijd is ongeveer 5 minuten, daarna faalt de controle zichtbaar in GitHub Actions. Daarmee is een groen resultaat gekoppeld aan de daadwerkelijk gedeployde commit, niet alleen aan geslaagde unit tests.

### Operationeel
Een rode live-smoke-controle vraagt om een inspectie van de Render-deployment, health-route, publieke featurevlaggen en authenticatiebeveiliging. Voer geen automatische rollback uit op basis van één mislukte externe aanvraag.

De test is bewust read-only voor persoonsgegevens en hergebruikt uitsluitend publieke, niet-gevoelige informatie. De applicatie zelf krijgt voor de publieke dossiercentrum-status `GET /api/dossiercentrum/status` (alleen `enabled`, `readOnly`) — geen secrets of persoonsgegevens.
