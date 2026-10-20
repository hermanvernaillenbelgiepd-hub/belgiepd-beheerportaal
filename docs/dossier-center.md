# BelgiumPD – centraal personeelsdossieroverzicht

Het dossiercentrum op `/dossiercentrum.html` toont uitsluitend bestaande, dienstgebonden personeelsfiches en bestaande auditgeschiedenis (rangwijzigingen en administratieve mutaties). De server haalt personeelsdata op via dezelfde `getSnapshot()` als Personeelsbeheer. De persoonssleutel is hulpdienst + Discord-ID.

Toegang vereist een geverifieerde Google- of Discord-aanmelding én een expliciet goedgekeurde kaderrol voor die hulpdienst. De server voert die controle uit bij ieder verzoek. Een Discord-rol alleen geeft nooit dossierinzage.

De endpoints `GET /api/dossiercentrum/overview` en `GET /api/dossiercentrum/:dept/:discordId` zijn alleen-lezen. Kandidaten, burgerdossiers en sollicitatiestatussen behoren **niet** tot dit overzicht. Er is geen import, achtergrondsynchronisatie of schrijfopdracht.

## Opheffing oude module

De oude burgerdossierpagina, de API-routes, zelfregistratie, burgerregistratiecode en de bijbehorende tests/documentatie zijn uit het actieve project verwijderd. Het oude pad geeft HTTP 410. De vroegere sollicitatiepagina's geven eveneens HTTP 410 en de sollicitatie-routes zijn niet meer gemonteerd. Bestaande Firestore-gegevens worden hiermee **niet** verwijderd. Het wissen van reeds bestaande burgergegevens vergt een afzonderlijke, gecontroleerde Firebase-databewerking met verificatie van de betrokken Discord-identiteit en eventuele audit- en bewaarplichten.

## TEST versus MAIN

Het TEST-portaal gebruikt het afzonderlijke Firebase-project `belgiepd-test`. Een MAIN-allowlist of een goedgekeurd MAIN-account hoeft niet in TEST te bestaan. Bij de melding 'Account is niet gemachtigd voor de koppeling' kan de gebruiker op de TEST-pagina Personeelsbeheer de rechtstreekse link naar Gebruikersbeheer gebruiken; `GET /api/users/me` geeft de eigen aanvraagstatus na geverifieerde Discord-aanmelding, zonder toegang tot andere accounts. Een bevoegde beheerder moet die status in TEST goedkeuren via het bestaande auditbare proces.

Nooit een toegang omzeilen door een Discord-rol of naam automatisch als beheerdersmachtiging te behandelen.
