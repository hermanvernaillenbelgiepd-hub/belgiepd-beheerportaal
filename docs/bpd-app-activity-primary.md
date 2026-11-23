# TEST: BelgiëPD-API als primaire bron voor Activiteitencentrum (alleen lezen)

Voorlopige TEST-opt-in:
- BPD_APP_API_BEARER_TOKEN = server-only secret
- BPD_ENABLE_BPD_APP_HOURS = true
- BPD_ACTIVITY_API_PRIMARY = true (standaard uit)

De server haalt álle pagina's van GET /api/v1/server-players op met een
bounded paginator. Alleen gegevens voor personeelsleden die de kijker
volgens de bestaande dossierautorisatie mag zien, worden geprojecteerd.

API compleet bereikbaar: totale speeluren en laatste verbinding rechtstreeks
van BelgiëPD, geen dagelijkse beroep op de oude ACTIVITEITSCHECK-sheet.
API onbeschikbaar of onvolledige paginering: dezelfde oude sheet als
tijdelijke fallback. RECORDS blijft voorlopig uitsluitend historische backup.

BELANGRIJK: play_time_minutes is geen afgesloten kalendermaandmeting.
Het veld periodPlayHours blijft leeg behalve bij onafhankelijk, vers en
ondertekend bewijsmateriaal van de bestaande FiveM-telemetrie. Daarom
zijn automatische 50/50-, INACTIEF- en 60+-pings op basis van de
BelgiëPD-API in deze fase bewust uitgeschakeld.

Personeelslijst is elders in server.js nog afhankelijk van Google Sheets.
De API vervangt geen dossiers, personeelsrangen of opleidingsoverzichten.
Alle spreadsheets verwijderen is pas mogelijk na migratie van het
canonieke personeelsregister naar Firestore en volledigheidscontrole.

Uitrol: TEST met echte token vergelijken, pas na overeenstemming, monitoring,
en expliciet akkoord de PRIMARY-flag op MAIN toepassen. Geen API-rolwrites.
