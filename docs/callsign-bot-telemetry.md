# FiveM/DC-bot: automatische speeltijdoverdracht naar vaste roepnummers

## Bestaande toestand
Het portaal kent uitsluitend geverifieerde aanvragen (minimaal 10 speeluren en 5 volledige dagen)
toe aan de procedure voor vaste roepnummers **200–299**. Het aantal speeluren wordt
**niet** door de officiële Discord API geleverd: dat moet uit de FiveM-statistiekendienst
of de bot achter \`/info member\` komen. In de aangesloten GitHub- en Render-accounts
is geen broncode van die bot beschikbaar.

## Ingebouwde ontvangstroute
\`POST https://belgiepd-beheerportaal.onrender.com/api/callsigns/bot/telemetry\`
Content-Type: \`application/json\`

Ingeschakeld **uitsluitend** wanneer op de Render-service beide ingesteld zijn:
- \`BPD_ENABLE_CALLSIGN_BOT_INGEST=true\`
- \`BPD_CALLSIGN_BOT_WEBHOOK_SECRET\` = een willekeurige gedeelde sleutel van minimaal 32 bytes.

Instellen via de Render-omgeving en de vertrouwde FiveM-statistiekenbot, **niet** via
de browser of een publiek Discord-bericht. Geheimen mogen niet in GitHub staan.
De bestaande \`BPD_DISCORD_BOT_TOKEN\` of \`DISCORD_BOT_TOKEN\` is tevens noodzakelijk
om het guildlidmaatschap zelf te controleren.

De bron stuurt de **gecontroleerde Discord-gebruikers-ID** die bij de FiveM-speler
hoort, plus exact geregistreerde totale speeltijd in seconden. Controleer in de
FiveM-bron de koppeling FiveM-ID → Discord-ID (niet op basis van een schermnaam).

Voorbeeldbody:
\`\`\`json
{
  "eventId": "session-84219-20261022T160000Z",
  "guildId": "VUL_DISCORD_SERVER_ID_IN",
  "discordId": "VUL_DISCORD_LID_ID_IN",
  "playSeconds": 36000,
  "observedAt": "2026-10-22T16:00:00.000Z",
  "source": "fivem-playtime"
}
\`\`\`
\`eventId\` is een per verzending unieke, onvoorspelbaar gekozen ID (12–64 tekens: A–Z, a–z, 0–9, - en _).
De bot moet de volledige body ondertekenen:
- \`X-BPD-Timestamp\`: huidige Unix-tijd in seconden, 10 cijfers;
- \`X-BPD-Signature\`: hexadecimale HMAC-SHA256 van de ruwe UTF-8 bytes
  \`<timestamp>.<exacte-json-body>\` met de gedeelde secret.

Een voorbeeld in Node.js (uit te voeren **in de vertrouwde botbackend**):
\`\`\`js
import {createHmac,randomUUID} from 'node:crypto';
const now=new Date();
const body=JSON.stringify({
  eventId:randomUUID(),guildId:process.env.DISCORD_GUILD_ID,
  discordId:verifiedLinkedDiscordId,
  playSeconds:verifiedTotalPlaySeconds,observedAt:now.toISOString(),
  source:'fivem-playtime'
});
const timestamp=String(Math.floor(Date.now()/1000));
const signature=createHmac('sha256',process.env.BPD_CALLSIGN_BOT_WEBHOOK_SECRET)
  .update(timestamp+'.').update(Buffer.from(body)).digest('hex');
const result=await fetch('https://belgiepd-beheerportaal.onrender.com/api/callsigns/bot/telemetry',{
  method:'POST',headers:{'content-type':'application/json',
    'x-bpd-timestamp':timestamp,'x-bpd-signature':signature},
  body
});
if(!result.ok)throw new Error('Botkoppeling mislukt: '+result.status);
\`\`\`

## Verwerking
1. Portal controleert HMAC, timestamp (maximaal 5 minuten verschil), schema en
   duplicaat \`eventId\`; een verkeerde signature geeft 401.
2. Portal vraagt **zelf** via Discord REST het guildlidmaatschap en \`joined_at\` op.
   Zonder bevestiging wordt het bewijs niet gebruikt.
3. Portal controleert minstens 10 volledige uren (36.000 seconden) en vijf volledige
   dagen lidmaatschap met de bestaande conservatieve kalenderdagberekening.
4. Alleen een bestaande openstaande aanvraag krijgt automatisch de status
   \`verified\` of \`needs_verification\`, met een onveranderlijke auditregel.
5. **Geen automatische definitieve goedkeuring of uitgifte**. Voor een roepnummer
   200–299 blijven de bestaande beslissing door Officierenkader/Korpsleiding,
   unieke reservering en verificatie van Google Sheets actief.

## Niet doen
- Geen \`/info member\`-screenshots als geverifieerde bottelemetrie accepteren.
- Geen privébot-token via een publieke frontend uploaden.
- De ontvangst niet inschakelen voordat een vertrouwde backend echte
  FiveM-speeluren en een geverifieerde Discord-identiteit levert.
- Geen automatische roepnummeruitgifte zonder aanvullende afzonderlijke
  veiligheids- en autorisatietests.
