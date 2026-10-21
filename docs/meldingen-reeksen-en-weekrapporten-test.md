# BelgiumPD — Meldingen, reekshoofden en 14-daagse rapportage (TEST)

## Gerealiseerd in TEST-code
- Nieuw scherm `/meldingen.html`, gekoppeld aan de Meldingen-knop. Serverroute `/api/notifications/me` gebruikt de reeds gemapte Discord-ID, de politionele rang en expliciete reekshoofd-toewijzingen.
- Persoonlijk: melding bij verlopen goedgekeurd verlof, met **expliciet aanvinken** en bevestigen. De bevestiging wordt opgeslagen onder `bpd_leave_returns` en in `bpd_weekreport_events`.
- Voor aangewezen reekshoofden van **reeks 1, 2 en 3 afzonderlijk**: waarschuwingen vanaf 12, 27 en 57 dagen zonder activiteit; meldingen over verlopen verloven en bevestigde terugkeerders. Meldingen blijven open na de drempeldag totdat iemand ze afhandelt. Geen automatische straf, 50/50-statuswijziging of uitschrijving.
- Officierenkader en korpsleiding: meldingen van **alle drie reeksen**, pending verlofverzoeken waarvoor hun graad bevoegd is, en aanvragen vaste roepnummers. Voor roepnummeraanvragen blijft handmatige controle beschikbaar; de rechtstreekse Discord-botkoppeling bestaat nog niet.
- Verlofbevoegdheid: aangeleverde graad wordt altijd uit het serverpersoneelssnapshot berekend, niet uit de browser. Middenkaderverlof vraagt officierenkader of korpsleiding. Verlof van officierenkader >30 dagen uitsluitend korpsleiding. Korpsleiding registreert eigen verlof zonder afzonderlijke goedkeuring.
- Inactiviteit is **twee afzonderlijke signalen**: dagen sinds laatst gemeten connectie (12/27/57), en geverifieerde **uren per kalendermaand** (≤10 inactief, >10 t/m 20 50/50, >20 actief). De bestaande 14-daagse Sheets-playtime wordt **niet valselijk als maanduren gebruikt**.
- Komende opleidingen voor politiemedewerkers van basiskader/agentenkader worden alleen getoond als er een echte geplande opleiding onder `bpd_training_sessions` met `dept:'politie'`, `status:'gepland'`, geldige `startDate` en `title` bestaat. Historische opleidingsevaluaties worden niet als toekomstige sessies voorgesteld.
- Alle reekshoofdafhandelingen verdwijnen voor de andere gemachtigde collega’s via één Firestore-sleutel `bpd_notification_actions`, met onveranderlijke gebeurtenis in `bpd_weekreport_events`. Terugkeerbevestigingen worden eveneens gelogd.
- Weekrapportperiodes beginnen op maandag, lopen 14 kalenderdagen, basisanker 19 oktober 2026. Middenkader ziet **lopende en direct voorafgaande** periode (uitsluitend events eigen toegewezen reeks); officieren/korpsleiding tot 27 eerdere periodes over de drie reeksen. Opslaan kan uitsluitend hogere leiding en alleen nadat een periode volledig is verstreken. Bij opslaan bewaren we een eigen **vaste kopie** van de events in `bpd_fortnight_reports`; later toegevoegde events herschrijven geen opgeslagen rapport.
- Er is in `/weekrapporten.html` een link naar het nieuwe automatische rapportoverzicht. Integratie in de oudere DOCX/weekrapport-conceptgenerator is een aparte vervolgstap; dit systeem exporteert de automatische logs nog niet naar een Word-template.

## Benodigde configuratie (niet raden)
`BPD_POLICE_SERIES_HEADS_JSON` moet worden ingesteld op de TEST-service, bijvoorbeeld:
```json
{"1":["111111111111111111"],"2":["222222222222222222"],"3":["333333333333333333"]}
```
**Dit zijn voorbeeld-ID's. Niet overnemen.** Vul de echte gecontroleerde Discord-ID's van de reekshoofden in. Zonder expliciete toewijzing kan een middenkaderlid géén meldingen van een reeks zien of afhandelen. Officierenkader/korpsleiding blijven beperkt tot hun vertrouwde politierol.

`BPD_ENABLE_NOTIFICATIONS_WRITES=true` activeert terugkeerbevestiging, meldingen afhandelen en rapportmomentopnamen **alleen op een apart Firestore-project `FIREBASE_PROJECT_ID=belgiepd-test`**. Laat uit zolang de gescheiden database en autorisaties niet gecontroleerd zijn. Er zijn geen wijzigingen aan Google Sheets of aan MAIN.

## Bot-gegevens die nog gekoppeld moeten worden
- Maandelijkse botmeting onder `bpd_monthly_activity`: `discordId`, `month:YYYY-MM`, `hours:number`, `sourceVerified:true`. Alleen door een geauthenticeerde backend-bot of bevoegde controle ingevuld. De portaalcode biedt momenteel **geen publiek schrijftoegangspunt** hiervoor.
- Voor toekomstige opleidingen moet een bevoegd opleidingsbeheerder sessies invoeren onder `bpd_training_sessions`. Nog geen scherm voor planning; er worden geen fictieve opleidingen getoond.
- Automatische botcontrole van `/info member`, Discord rol-synchronisatie, pushmeldingen buiten het portaal en automatische verwijdering van medewerkers bestaan bewust nog niet.

## Gegevensbescherming en opvolging
De Discord-ID is de vaste identiteit; het roepnummer is een wijzigbaar attribuut. Meldingen en rapporten controleren rechten aan de serverzijde. Alleen het aanleggen van een **voorstel** voor inactiviteit leidt nooit automatisch tot uitschrijving. Eerst menselijke validatie van verlof, maanduren, bronbetrouwbaarheid, personeelsstatus en een registreerbare beslissing.
