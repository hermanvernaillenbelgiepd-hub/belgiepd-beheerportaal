# BelgiumPD – burgerdossiers (eerste veilige versie)

## Doel
Elke BelgiumPD-speler kan, ook zonder politiefunctie of hulpdienstsollicitatie, via **zijn eigen geverifieerde Discord-login** een afzonderlijk burgerdossier opbouwen. Daarnaast kan een toekomstige betrouwbare FiveM-bot, via het reeds voorbereide telemetrie-endpoint, het burgerdossier voor een geverifieerde Discord-ID automatisch aanmaken. Bestaande personeels- en sollicitatiedossiers blijven afzonderlijke Firestore-collecties.

## Productie: standaard UIT
De module is in MAIN **niet automatisch actief**. De beheerder moet eerst in de juiste Render-omgeving instellen:
- \`BPD_ENABLE_CITIZEN_DOSSIERS=true\` voor de burgerdossier-API en zelfregistratie.
- \`BPD_ENABLE_DISCORD_PORTAL_LOGIN=true\` plus de al gecontroleerde Discord OAuth/Firebase-configuratie voor de zelfregistratie.

Als de bestaande FiveM-bron later online komt, gelden **ook** de reeds bestaande beveiligingsvoorwaarden van \`POST /api/service-applications/telemetry\`:
- \`BPD_ENABLE_SERVICE_APPLICATIONS=true\`
- \`BPD_ENABLE_FIVEM_EVIDENCE_INGEST=true\`
- \`BPD_FIVEM_EVIDENCE_SECRET\` (nieuwe afzonderlijke geheime server-to-server-sleutel, nooit een Discord-token)
- Betrouwbare server-side mapping van FiveM-account naar werkelijke Discord-ID

**Alleen als de burgerdossier-feature aan staat** maakt de bestaande telemetrie-ingang vervolgens een ontbrekend burgerdossier aan. Zonder aangesloten bot worden geen speeluren verondersteld en worden geen burgers massaal geïmporteerd. De telemetrie zelf blijft als HMAC-ondertekend bewijs in \`bpd_fivem_verified_playtime\` staan.

## Firestore
Collectie \`bpd_citizen_dossiers/{discordId}\`:
- \`discordId\` – de geverifieerde Discord-identiteit (nooit client-invoer).
- \`origin\` – \`discord_oauth\` of \`trusted_fivem_server\`.
- \`displayName\` – niet-officiële gebruikersnaam; geen bewijs van echte identiteit.
- \`category='burger'\`, \`state='registered'\`, server-timestamps.
- \`audit\` subcollectie – bron en moment van eerste creatie.
- Geen rangen, rechten, tokens, officiële ID-gegevens of niet-geverifieerde speeltijden.

Bij bestaande dossiers kan een verse Discord-aanmelding alleen de getoonde Discord-naam bijwerken. Het originele aanmaakmoment en de bron blijven bewaard.

## API
- \`GET /api/citizens/status\`: alleen een publieke aan/uit-vlag.
- \`GET /api/citizens/me\`: alleen voor recent door Discord OAuth geverifieerde eigenaar. Leest eigen burgerprofiel, eigen sollicitatiestatussen (als de sollicitatiemodule actief is) en uitsluitend cryptografisch geldig, recent FiveM-bewijs.
- \`POST /api/citizens/me/register\`: alleen eigen geverifieerde Discord-ID; geen zelf ingegeven ID, uren, rang, rol of dossiervelden toegestaan. Herhaalde registratie creëert geen dubbel dossier.
- \`/burgerdossier.html\`: persoonlijke pagina, beveiligd met dezelfde Firebase-Discord-login als de bestaande portaalpagina's.
- Het **centrale kaderdossier** blijft strikt dienstgebonden: de burgerfiche wordt alleen bijkomend getoond wanneer de kadergebruiker al gerechtigd is om de bestaande personeelsfiche of sollicitatie met precies dezelfde dienst + Discord-ID te bekijken. Alleen het bestaan van een burgerprofiel verleent nooit raadpleegrechten.

## Grenzen van deze versie
- Geen algemene lijst van alle burgers voor het kader, geen naamgebaseerde identiteitskoppeling, geen burgerlijke/justitiële persoonsdossiers en geen automatisch gesynchroniseerde Discord-rollen.
- Een Discord-account is geen bewijs van FiveM-deelname; zolang de bot ontbreekt, verschijnen geen serveruren of eerste FiveM-verbinding.
- Wie nooit via Discord inlogt en over wie de bot nog geen **betrouwbare servertelemetrie** verstuurt, kan nog niet automatisch een dossier krijgen.
- Extra privacyregels, bewaartermijnen en inzagemachtigingen zijn nodig vóór eventuele uitbreiding naar gevoelige burger- of interventieregistraties.

## Acceptatiecontroles vóór activeren
1. Feature uit: \`/api/citizens/me\` en registratie geven 503.
2. Ongeldige token, Google-login, verouderde Discord-verificatie of verkeerd guild: geen inzage of registratie.
3. Ingelogde burger ziet alleen eigen dossier en eventueel eigen geverifieerde FiveM-data.
4. Registreren is idempotent en auditbaar, zonder enige personeelstoegang of Discord-roltoekenning.
5. Bestaande sollicitaties en personeelsfiches blijven intact.
6. De telemetriebron kan zonder gedeelde secret of ongeldige payload geen dossiers aanmaken.
7. Bevoegd kader ziet in het dossiercentrum geen willekeurige burgers buiten de reeds toegelaten dienst- en dossierrelatie.

Voer eerst tests uit met TEST-Firebase en TEST-Render; sluit MAIN pas aan wanneer de werkelijke Discord/FiveM-bron en de gegevensverwerking gecontroleerd zijn.
