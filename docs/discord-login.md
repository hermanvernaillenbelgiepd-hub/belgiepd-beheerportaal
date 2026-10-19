# Eén onthouden Discord-login (BelgiumPD)

De portal-authenticatie verloopt via Discord OAuth2 -> Firebase Custom Token -> 
Firebase Auth (persistente browseropslag). Dezelfde sessie wordt op alle pagina's herkend.
Er is een afmeldknop; gedeelde computers moeten altijd afgemeld worden.

## Vereiste Render-omgeving (productie)

Maak de volgende waarden aan in de **productie**-webservice (niet hier in GitHub):
- `DISCORD_CLIENT_ID` — Discord Application Client ID
- `DISCORD_CLIENT_SECRET` — gevoelige Discord OAuth2-secret; **nooit publiceren of in chat plakken**
- `DISCORD_GUILD_ID` — Discord server-ID
- `DISCORD_REDIRECT_URI` — exact `https://belgiepd-beheerportaal.onrender.com/auth/discord/callback`
- `BPD_ENABLE_DISCORD_PORTAL_LOGIN=true` — pas inschakelen wanneer alle bovenstaande waarden correct zijn

Configureer exact dezelfde Redirect URI onder Discord Developer Portal -> OAuth2 -> Redirects.
OAuth scopes: `identify guilds.members.read`. De backend controleert werkelijk lidmaatschap via
Discord, maakt een Firebase custom token en bewaart geen Discord OAuth access/refresh tokens.

## Bevoegdheidscontrole

De bron van personeelsmachtigingen blijft **`BPD_ACCESS_JSON`**. Er is exact één
goedkeurd Google-account nodig met `discordId` gelijk aan de persoonlijke Discord ID.
Bij een dubbele koppeling van dezelfde Discord ID worden administratieve rechten geweigerd.

Voorbeeld van één toestemming, te integreren in bestaande allowlist:
```json
"geeraerts.benjamin1@gmail.com": {
  "role": "officierenkader",
  "departments": ["politie"],
  "departmentRoles": {"politie": "officierenkader"},
  "discordId": "505659510359064606"
}
```
Verwijder diezelfde Discord ID bij andere accounts. Bewaar de andere bestaande accounts
en Firebase/Google-serviceaccount-gegevens.

De gebruiker blijft in de browser aangemeld totdat die afmeldt, lokaal de browsergegevens
wist of Firebase de sessie ongeldig maakt. Voor **beveiligde personeelsacties** moet
de Discord-guildverificatie maximaal zeven dagen oud zijn; daarna is opnieuw
op Discord verifiëren vereist, zonder andere accountgegevens opnieuw in te voeren.

## Veilig uitrollen

1. `npm ci && npm test && npm run check` moeten geslaagd zijn.
2. Controleer `GET /auth/discord/status`: `ready: true`.
3. Zet `BPD_ENABLE_DISCORD_PORTAL_LOGIN=true` in Render productie.
4. Doe handmatig een Discord-login, navigeer naar verschillende modules, sluit de browser
   en open opnieuw: de sessie hoort herkend te worden.
5. Controleer individuele roltoegang, uitsluiting van niet-gemachtigde accounts,
   voorkomen van eigen verlofgoedkeuring en afmelden.
6. Houd Google-noodlogin beschikbaar tot de acceptatietests geslaagd zijn.

## Nog niet ondersteund

Volledig automatische herverificatie zonder opnieuw langs Discord te gaan
vereist een gecontroleerde Discord-bot/serverkoppeling; OAuth-tokens worden nu bewust
niet langdurig opgeslagen. Ook wordt een ingetrokken Discord-gildelidmaatschap niet
continu gevolgd; zeven dagen is de maximale ouderdom van een serververificatie.
