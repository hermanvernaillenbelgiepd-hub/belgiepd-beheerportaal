# BelgiumPD · Sonoran Panic Bridge

Deze FiveM-resource stuurt **uitsluitend** Sonoran Radio paniekactiveringen en het wissen ervan naar het TO-portaal.

## Installatie op een bevoegde FiveM-server

1. Plaats de map `bpd_to_panic_bridge` in de `resources`-map van de FXServer.
2. Stel in `server.cfg` in (gebruik een **apart** willekeurig token van minstens 32 tekens):

```cfg
set bpd_panic_url "https://belgiepd-beheerportaal-testserver.onrender.com/api/to/panic-hook"
set bpd_panic_token "VUL_HIER_EEN_APART_WILLEKEURIG_GEHEIM_VAN_MINSTENS_32_TEKENS_IN"

ensure sonoranradio
ensure bpd_to_panic_bridge
```

3. Vul **exact hetzelfde** token als environment-variabele `BPD_FIVEM_PANIC_TOKEN` in de TEST-service van Render in.
4. Herstart FiveM en controleer de serverconsole. Druk met een testaccount op de Sonoran noodknop en open het TEST TO-dienstbord.
5. Controleer dat wissen van de Sonoran paniekstatus het rode alarm ook verwijdert.

**Veiligheid:** token nooit in GitHub, Discord of screenshots plaatsen; gebruik **niet** `SONORAN_RADIO_API_KEY`. De URL moet HTTPS zijn. Zonder geldige sleutel is het portaalendpoint niet bruikbaar. Alleen de serverresource mag paniekmeldingen sturen; geen publieke clientevents.

**Locatie:** in GTA/FiveM-spelcoördinaten. De kaartknop opent een externe interactieve GTA-kaart, waarvan de beschikbaarheid van de aanbieder afhangt. Het is geen echte GPS-locatie. Het portaal toont uitsluitend de laatste locatie van het paniekevent als die beschikbaar is, geen continu live volgen.

**Opslag:** het portaal bewaart actuele paniekstatussen met een registratie van de laatste clear. De lijst met afgehandelde signalen op het bord toont de afgelopen 24 uur. Firestore-documenten worden niet automatisch permanent verwijderd tenzij je een retentiebeleid configureert.

Developer-eventdocumentatie: https://docs.sonoransoftware.com/radio/developer-documentation/developer-documentation/resource-events
