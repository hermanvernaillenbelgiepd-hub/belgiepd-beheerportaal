# BelgiumPD FiveM activiteitsmonitor (voorbereid, opt-in)

Deze functie maakt **uitsluitend** 50/50- en INACTIEF-*meldingen*. Ze
verandert geen personeelsstatus, verwijdert geen lid, wijzigt geen Discord-rol
en schrijft niet naar Google Sheets.

## Wat de FiveM-tijdbron moet aanleveren

Het bestaande roepnummerwebhook levert alleen totale speeluren en kan NIET
worden gebruikt om maandelijkse of afwezigheidswaarschuwingen af te leiden.

Een **vertrouwde server-to-server FiveM-bot** stuurt minstens één keer per
24 uur een met HMAC-SHA256 ondertekende POST naar:

`POST /api/activity/bot/telemetry`

Een voorbeeldbody, **geen echte spelersgegevens**:

```json
{
  "eventId": "activity_20261103_00001",
  "guildId": "111111111111111111",
  "discordId": "222222222222222222",
  "observedAt": "2026-11-03T10:30:00.000Z",
  "source": "fivem-activity",
  "closedMonth": "2026-10",
  "closedMonthPlaySeconds": 57600,
  "lastConnectedAt": "2026-11-01T19:15:00.000Z"
}
```

`lastConnectedAt` mag `null` zijn als de FiveM-bron geen betrouwbare
laatste verbinding heeft: dan worden geen afwezigheidspings uitgerekend.

De headers moeten exact overeenkomen met het bestaande beveiligde
roepnummerwebhook:
- `X-BPD-Timestamp`: huidige Unix-tijd in seconden (10 cijfers)
- `X-BPD-Signature`: HMAC-SHA256 in hex van
  `timestamp + '.' + raw-json-body`
- `Content-Type: application/json`

Ondertekening gebeurt in de bot met dezelfde *reeds beveiligde* geheime
sleutel die Render in `BPD_CALLSIGN_BOT_WEBHOOK_SECRET` bewaart.
Geef de sleutel nooit door aan de browser of commit hem nooit naar GitHub.
De bot moet alle nog geregistreerde leden meenemen, **ook offline leden**,
met hun echte vorige-maand-totalen. Alleen verbonden spelers verwerken zou
de opvolging van afwezigheid onmogelijk maken.

De server controleert de HMAC, versheid (max. 5 minuten), unieke event-ID,
gilde en het huidige Discord-lidmaatschap via Discord's bot-API. Replays en
oudere metingen worden geweigerd. De vorige maand is in tijdzone
Europe/Brussels. Datum- en speeltijdbewijs wordt in Firestore opgeslagen.

## Automatische criteria

- De **afgesloten vorige kalendermaand**: <10 uur => INACTIEF-ping,
  10 tot <20 uur => 50/50-ping. Geen controle in de eerste onvolledige
  lidmaatschapsmaand.
- **14 dagen** geen geverifieerde FiveM-verbinding => 50/50-ping.
- **30 dagen** => INACTIEF-ping.
- **60 dagen** => **geen automatische ontslag- of archiveringsactie**.
- Goedgekeurd verlof onderbreekt de afwezigheidsteller; een maand met
  goedgekeurd verlof krijgt geen maandelijkse urensignalering.
- Onbekende of ouder dan 36 uur geverifieerde gegevens: **geen ping**.
- Per controlemoment maximaal één waarschuwing van de strengste categorie.
- Herhaalde controles kunnen dezelfde ping niet opnieuw opslaan. Een nieuw
  incident of een hogere drempel kan wel een aparte ping opleveren.

Elke waarschuwing krijgt één deterministische bewijs-ID en wordt via één
Firestore-transactie vastgelegd in het dossier, het dienstweekrapport en
`Mijn meldingen`. De bestaande GELEZEN-actie logt ook de leesbevestiging.

## Activatie

Deze functionaliteit is bewust gescheiden van de bestaande roepnummeraanvraag.
Twee onafhankelijke Render-variabelen zijn nodig:

```text
BPD_ENABLE_ACTIVITY_TELEMETRY=true
BPD_ENABLE_ACTIVITY_AUTO_PINGS=true
```

Eerst uitsluitend de ingest aanzetten, een testlid met echte data controleren
en pas daarna de automatische pings inschakelen. **Beide schakelaars blijven
uit totdat de betrouwbare FiveM-bot ook effectief gegevens verstuurt.**

Na activering controleert het portaal ongeveer iedere zes uur de laatst
geverifieerde metingen. Er is geen extra Render-cronservice nodig; opnieuw
opstarten en gelijktijdige controles zijn door transactionele unieke IDs veilig.

### Beperkingen

De aangepaste backend genereert geen FiveM-speeluren zelf. Een bot of
server-API moet de gegevens werkelijk meten en versturen. Zonder die
bron zijn de regels veilig inactief. Deze module is geen automatische
personeelsstatuswijziging en is ook geen ontslagmodule.
