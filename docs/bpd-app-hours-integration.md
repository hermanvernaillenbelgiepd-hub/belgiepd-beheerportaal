# BelgiëPD-app API – veilige TEST-fase (speeluren en sollicitatiecontrole)

Status: alleen-lezen opt-in. Niet actief zonder expliciete TEST-omgevingvariabelen.

## TEST inschakelen
In Render TEST, nooit in de browser of GitHub:
- BPD_APP_API_BEARER_TOKEN = door BelgiëPD-beheer verstrekte Bearer Token.
- BPD_ENABLE_BPD_APP_HOURS = true (standaard uit).

De server mag uitsluitend vaste HTTPS-routes op https://app.belgiepd.be/api benaderen,
met het opgegeven Discord-ID uit de bestaande, geverifieerde OAuth-sessie:
- GET /v1/server-players/{discordId}
- GET /v1/duty-times/{discordId} (enkel structurele probe, geen ureninterpretatie)

Mijn profiel laat de totale play_time_minutes en de laatste verbinding zien.
De 10-uur / 5-dagen toets is uitdrukkelijk INFORMATIEF en heeft geen effect
op sollicitaties, personeel, Discord-rollen of meldingen.

## Openstaand voor volgende fases
1. API-response van duty-times: exacte velden voor dienst-ID, begin/einde,
   duur, paginering, tijdzone, foutcodes en eventuele filters. Het oude
   belgiëpd.json schema bevat deze endpoint niet.
2. Stabiele mapping van de echte dienst-ID's naar Politie, Brandweer,
   Ambulance, Depannage, Burger; omgaan met meerdere diensten op één account.
3. Verifieer of play_time_minutes levenslange totale minuten betekent.
4. Ontwerp maandelijkse snapshots en diensturen-trends om vorige
   kalendermaand, gemiddelden en verlofcorrectie betrouwbaar te berekenen.
5. Dienstleiding/instructeur kan uitsluitend eigen dienstleden zien.
   Dossierinfo alleen via bestaande server-side dossierautorisatie.
6. Sollicitatieformulier en beoordelingsroute moeten nog gerealiseerd worden.
   Aanvaarden geeft niet automatisch een personeelsfiche of rechten.
7. Automatische 50/50- en INACTIEF-pings uitsluitend na betrouwbaar afgesloten
   maandbewijs, verlof/ziekte-correctie, idempotente registratie en TEST-controle.
8. POST /v1/discord/role-assignments en POST /v1/discord/role-removals
   NIET aansluiten of aanroepen zonder expliciete rolmapping, bevoegd
   besluit, aparte actiebevestiging, idempotente audit en foutafhandeling.

Token nooit in logs. Geen automatische Discord-pings, rolmutaties of
personeelsstatuswijzigingen door deze eerste koppeling.
