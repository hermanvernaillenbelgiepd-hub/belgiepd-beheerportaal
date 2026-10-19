# BelgiumPD — instroomrangen en sollicitatiedossiers

## Politie (toepasbaar op MAIN na geslaagde release)
- Iedere reguliere aanwerving start in rang **Agent** en status **In opleiding**.
- Een andere startwaarde is een **uitzonderlijke instaprang**; enkel geverifieerde korpsleiding van politie of technische beheerder met beheerder-rol in politie mag die registreren.
- Het formulier eist een expliciete bevestiging en minimaal 30 tekens afzonderlijke motivering. De server voert dezelfde controles opnieuw uit.
- De Firestore-aanmaak legt twee append-only auditregels vast: `create` en `entry_rank` of `exceptional_entry_rank`. Daarin staan eerdere rang (null), nieuwe rang, standaardrang, datum, actor en motivering. Bij latere Discord-koppeling wordt het oorspronkelijke rangbesluit ook in het actieve dossier geregistreerd.
- Inschrijving/promotie in het **portaal** kent NOOIT automatisch Discord-rollen, dossierbevoegdheden of serverrechten toe. Bestaande Google Sheets-rangen blijven onaangeroerd.
- Volgende fase: promotie-/degradatieprocedure met eigen audit- en goedkeuringsrecords, zonder automatische rechtentoekenning. Alleen van toepassing na afzonderlijke beleidsbeslissing.

## Brandweer / ambulance / depannage: eigen sollicitatiedossiers (voorbereide policy, NIET geactiveerd)
- De burger kan zich rechtstreeks kandidaat stellen voor een van de drie diensten, ook zonder politiepersoneelsfiche.
- Toelating tot solliciteren vereist **beide** onafhankelijk geverifieerde voorwaarden: minimaal 10 totale **FiveM-speeluren** (36.000 seconden) EN minimaal 5 dagen (120 uur) sinds de eerste geregistreerde FiveM-serververbinding.
- Nooit berekenen op basis van politie-activiteitstabellen, een Discord-join-datum, een opgegeven getal uit een formulier of een door een gebruiker bewerkbaar veld.
- Nog te koppelen: vertrouwde, server-side FiveM/CFX of bot-telemetrie met `totalPlaySeconds`, `firstServerJoinAt`, `verifiedAt` en `source='trusted_fivem_server'`. Bewijs mag maximaal 24 uur oud zijn en moet opnieuw geverifieerd worden voordat een aanvraag mag worden ingediend.
- Indien bewijs ontbreekt, te oud of onbetrouwbaar is: status `verification_required`. Bij te weinig uren of dagen: `not_yet_eligible`; aanvragen blijven geblokkeerd. Alleen `eligible` mag tot inzending leiden.
- Per hulpdienst een afzonderlijk afgeschermd dossier in de toekomstige Firestore-collectie `bpd_service_applications` met veilige ID `dept_discordId`; dezelfde burger kan drie onafhankelijke sollicitaties indienen.
- Voorgesteld dossier: `discordId` (uit geverifieerde Firebase/Discord-identiteit), `dept`, `motivation`, `status`, `verifiedEligibility`, `createdAt`, `updatedAt`. Elke beslissing in append-only `audit` onder het dossier, inclusief actor, tijdstip, motivering.
- Statusflow: `submitted` → `reviewing` → `accepted` of `rejected`; `withdrawn` op verzoek. Een aanvaarde sollicitatie creëert **niet automatisch** een personeelsfiche; pas daarna voert het bevoegd kader de instroom uit en volgt de gewone Discord-koppeling.
- Sollicitaties mogen alleen zichtbaar zijn voor bevoegde beoordelaars in die hulpdienst; andere diensten, onbevoegde kandidaten en gewone burgers krijgen geen dossierinzage.
- Bestaande burger-sollicitatieprocedure blijft intact; wanneer zijn technische integratie bekend is, delen de diensten hetzelfde patroon, maar niet dezelfde dossierdata of rechten.

## Wat al gebouwd is
- `src/service-applications-policy.js`: centrale, fail-closed geschiktheidscontrole en dossier-ID/aanvraagvalidatie.
- `tests/service-applications-policy.test.js`: grenzen en beveiliging.
- Nog **geen** inzend-API, sollicitatiepagina, schrijfactie of productieactivatie voor de drie niet-politiediensten. Daarvoor eerst de geverifieerde bron en dienstspecifieke beoordelingsrechten vastleggen.

## Uitrolregels
1. Eerst GitHub-tests en TEST-deployment controleren.
2. Politie-rangbeleid kan naar MAIN zonder datawijziging; de sollicitatielogica is louter een voorbereid, ongebruikt beleid.
3. Bestaande MAIN-personeelsgegevens, roepnummers, Google Sheets en Discord-rollen blijven ongewijzigd.
