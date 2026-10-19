# BelgiumPD — zelfstandige sollicitatiemodule voor niet-politiediensten

## Status en scheiding

De burger of medewerker solliciteert zelfstandig voor `ambulance`, `brandweer` of `depannage`, ook als er geen politiepersoneelsfiche of portaalrol bestaat. Elke sollicitatie heeft een afzonderlijk Firestore-dossier `bpd_service_applications/{dept}_{discordId}` en `audit`-subcollectie. Dossierinhoud is niet in openbare API-antwoorden zichtbaar.

**Productie: standaard UIT.** `BPD_ENABLE_SERVICE_APPLICATIONS=true` is vereist voor dossierinzage, aanvragen en kaderbeoordeling; dit gaat pas aan wanneer de FiveM-bewijsbron betrouwbaar aangesloten is. Voor TEST mag de vlag aan om de interface en weigering bij ontbrekend bewijs veilig te controleren.

## Toelating

Beide voorwaarden zijn verplicht:
1. Minstens 36.000 seconden **werkelijke, geverifieerde FiveM-speeltijd**.
2. Minstens vijf dagen sinds de **eerste FiveM-serververbinding**.

Er wordt geen automatische toelating gegeven op basis van Discord-join, zelfgerapporteerde uren, een politietabel of ontbrekende gegevens. Het bewijs mag niet ouder zijn dan 24 uur. De bewijsbron moet gekoppeld zijn aan de echte, door OAuth geverifieerde Discord-ID.

## Vertrouwde gegevens uit FiveM/bot koppelen

Er is een afzonderlijk, expliciet uit te schakelen server-to-server endpoint:

`POST /api/service-applications/telemetry`

Op Render (TEST, later MAIN) moeten daarvoor ingesteld worden:
- `BPD_ENABLE_SERVICE_APPLICATIONS=true`
- `BPD_ENABLE_FIVEM_EVIDENCE_INGEST=true`
- `BPD_FIVEM_EVIDENCE_SECRET`: een **nieuwe willekeurige secret van minstens 32 tekens**, exclusief voor FiveM-telemetrie, nooit Discord Client Secret of bestaande bot-token hergebruiken.

Een vertrouwde server-side FiveM-bron/bot verzendt via HTTPS (nooit vanuit de browser) het volgende:

```json
{
  "discordId": "123456789012345678",
  "totalPlaySeconds": 36000,
  "firstServerJoinAt": "2026-10-01T08:00:00.000Z"
}
```

HTTP header: `Authorization: Bearer <BPD_FIVEM_EVIDENCE_SECRET>`; `Content-Type: application/json`.

De BelgiumPD-server valideert de payload, vult zelf het verificatietijdstip in, ondertekent de gegevens met HMAC-SHA256 en slaat ze server-side op onder `bpd_fivem_verified_playtime/{discordId}`. Aanvragen lezen alleen een bewijs dat **ook qua ondertekening** geldig is. Zelfgemaakte Firestore-records zonder geldige HMAC laten geen aanvraag toe.

Er wordt geen integratie als voltooid gemeld totdat bekend is hoe FiveM de Discord-ID, totale speeltijd en eerste verbinding betrouwbaar beschikbaar stelt. De bestaande bot voor Discord mag eventueel de data doorsturen, maar **mag ze niet zelf verzinnen**.

## API en autorisatie

| Endpoint | Wie | Werking |
|---|---|---|
| `GET /api/service-applications/status` | Openbaar | Leest alleen booleans en mogelijke diensten |
| `GET /api/service-applications/me` | Recente geverifieerde Discord-login | Alleen eigen geschiktheid en eigen dossiers |
| `POST /api/service-applications/submit` | Gecontroleerde Discord-identiteit én geverifieerd bewijs | Één dossier per dienst; motivatie 40–3000 tekens |
| `GET /api/service-applications/review?dept=...` | Bevoegd kader van die dienst | Alleen sollicitaties van eigen hulpdienst |
| `POST /api/service-applications/:dept/:discordId/decision` | Bevoegd dienstkader, geen zelfbeoordeling | `submitted -> reviewing/rejected`, `reviewing -> accepted/rejected` met motivering en auditlog |
| `POST /api/service-applications/telemetry` | Enkel aparte serversecret | Ontvangt ondertekende speelurenbewijzen vanuit FiveM |

**Een aanvaarde sollicitatie maakt geen personeelsfiche of roepnummer aan**, geeft geen dossierinzage en kent geen Discord-rollen toe. Dat gebeurt vervolgens via bestaande personeelsinstroom en koppeling, onder eigen bevoegde controles.

## Pagina's

- `/solliciteren.html`: publieke pagina, maar status en verzending vereisen een eigen recente Discord OAuth-aanmelding.
- `/sollicitatiebeheer.html`: beoordelingspagina voor bevoegd kader.
- Beide routes zijn afzonderlijk toegestaan als Discord OAuth return target.

## Openstaand

De echte FiveM-bron (framework/database/bot) en mapping naar Discord-ID moeten door de serverbeheerder bevestigd worden. Zonder deze gegevens is de pagina beschikbaar, maar kan ze geen sollicitaties aanvaarden. Test alleen met TEST Firebase en TEST-secret; neem nooit fictieve speeluurbewijzen of testsollicitaties over naar MAIN.
