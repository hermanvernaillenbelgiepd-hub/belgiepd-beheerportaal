# BelgiumPD · bestuursaanstellingen (Bestuur)

## Scheiding van functies

**Bestuur is geen politie- of hulpdienstrang.** Een aangesteld bestuurslid behoudt diens bestaande operationele rang, huidig personeelsdossier, dienstgebonden toegangsrechten en Discord-rollen. Het veld `role` en `departmentRoles` in `bpd_portal_users` worden door deze workflow nooit bijgewerkt.

Bestuur staat uitsluitend in `bpd_board_appointments/{discordId}`. Per kandidaat zijn er statussen: `pending`, `approved`, `rejected`, `revoked`, en een append-only subcollectie `audit`.

## Afzonderlijke bestuursbevoegdheden
Een bestuursfunctie heeft **geen** standaard beheerdersrechten. Tijdens een voordracht kunnen uitsluitend deze afzonderlijke machtigingen worden voorgesteld:

- `board_registry_read`: de lijst met **goedgekeurde** bestuursaanstellingen lezen, niet de vertrouwelijke personeelsregisters.
- `board_nomination_propose`: een nieuwe bestuursvoordracht indienen. Dit is **geen** toestemming om zelf goed te keuren of aanstellingen te wijzigen.

Een bestuurslid zonder deze machtigingen heeft alleen de eigen actieve bestuursstatus. De bestuursfunctie geeft geen toegang tot personeelsadministratie, sancties, promoties, Discord-rollen, verlofbesluiten of gebruikersbeheer.

## Goedkeuring
1. Een bestaande bevoegde korpsleider, de technische beheerder of een reeds expliciet gemachtigde voordrager dient een kandidaat-Discord-ID, motivering en gewenste bestuursmachtigingen in.
2. De server controleert dat de kandidaat reeds een goedgekeurd account heeft in `bpd_portal_users`; een louter Discord-rolletje of naam is onvoldoende. Er wordt een **pending** voordracht vastgelegd met de identiteit van de voordrager en een onveranderbare auditregistratie.
3. **Alleen technisch beheer** kan een voordracht goedkeuren of afwijzen. Onafhankelijke goedkeuring is de standaard. De bestaande technische eigenaar mag een door zichzelf ingediende voordracht voor **een ander personeelsaccount** behandelen uitsluitend wanneer de server diens geverifieerde, ondertekende technische beheerprofiel heeft bevestigd. De beslissing wordt uitdrukkelijk als technische uitzondering gelogd. **Zichzelf aanstellen blijft verboden.**
4. Bij goedkeuring controleert de server opnieuw dat het kandidaataccount goedgekeurd is. Pas daarna wordt de aanstelling actief met uitsluitend de expliciet voorgestelde machtigingen. Bestaande operationele rollen blijven gelijk.
5. Alleen technisch beheer kan een actieve aanstelling intrekken, met een verplichte motivering en auditregistratie. Bij intrekking verdwijnen de bestuursmachtigingen direct.

**Beveiliging:** alle mutaties vereisen een geverifieerde portaalidentiteit, een functie- en doelgroepcontrole, een gemotiveerde afzonderlijke beslissing, en opt-in featurevlaggen. Voorstellen, besluiten en intrekkingen gebruiken Firestore-transacties.

## Inschakeling

- `BPD_ENABLE_BOARD_APPOINTMENTS=true` toont de afzonderlijke bestuurssectie en activeert de gecontroleerde lees-API.
- `BPD_ENABLE_BOARD_APPOINTMENT_WRITES=true` geeft pas toegang tot voordrachten en besluiten als de eerste vlag eveneens aanstaat. Beide zijn standaard **uit**.

Er worden bij de deployment **geen bestuursleden aangesteld**. Ook BelgaMods wordt **niet** automatisch toegevoegd. Bestaande operationele rollen, waaronder Officierenkader, blijven intact.

## Navigatiefout Registraties → Dashboard
De link in Registraties verwijst naar `/`. Op de hoofdpagina werd een account zonder toegang tot de centrale personeelsdataset voorheen automatisch teruggeleid naar `/registraties.html`; die redirect veroorzaakte een navigatielus. In deze release ziet dat account een beperkt dashboard met directe navigatie naar de eigen toegelaten modules, **zonder fictieve personeelsgegevens**.

## Acceptatie
Voor uitrol: tests op voordracht door korpsleiding, weigering van voordracht door officier, tweede-persoonscontrole, blokkering van eigen goedkeuring, statushistoriek, explicit grants, hercontrole van kandidaatgoedkeuring en gescheiden Firebase-testdatabase. Gebruik gecontroleerde testaccounts; activeer daadwerkelijke bestuurswijzigingen op MAIN pas na de functionele TEST-proef.
