# Discord-personeelskoppeling — geïsoleerde TESTSERVER

Deze koppeling werkt **zonder extra bot**. De bestaande BelgiumPD OAuth2-login bevestigt de identiteit. Er is geen toegang nodig tot de Athena-bot-token.

## Stappen
1. Kaderlid maakt in `/personeelsbeheer.html` een fictieve medewerker zonder Discord-ID aan.
2. Het portaal maakt een Firestore-concept met interne referentie in `bpd_personnel_pending_links`.
3. Het kaderlid geeft die referentie privé aan de bedoelde medewerker.
4. De medewerker opent `/personeel-koppelen.html`, meldt zich met **eigen** Discord aan, vult de referentie in en dient een aanvraag in.
5. De server verifieert het Firebase custom token, het actuele Discord-lidmaatschap en de rol-ID's. Daarna wordt uitsluitend een **koppelaanvraag** op de conceptfiche geplaatst.
6. Een kaderlid uit de juiste hulpdienst ziet de naam, Discord-naam en Discord-ID en klikt **Koppeling goedkeuren** na identiteitscontrole.
7. Een Firestore-transactie controleert dat de conceptfiche nog openstaat, het Discord-account recent geverifieerd is, de Discord-ID nog niet bij een andere fiche in die dienst hoort, en de gereserveerde roepnummerclaim overeenkomt.
8. Daarna ontstaat één actieve Firestore-personeelsfiche met de echte Discord-ID. De eerdere conceptfiche blijft als **gekoppelde historiek** bestaan, zonder dubbele actieve personeelsfiche.

## Veiligheid
- Actief uitsluitend wanneer `BPD_TEST_FIXTURES=true`, `FIREBASE_PROJECT_ID=belgiepd-test`, `BPD_ENABLE_PERSONNEL_CREATION=true`, en `BPD_ENABLE_PERSONNEL_WRITES=true`.
- De medewerker moet recent (maximaal 15 minuten) met zijn eigen Discord-account hebben geverifieerd om een verzoek in te dienen.
- De kadergoedkeuring controleert de actuele opgeslagen lidmaatschapsverificatie opnieuw; geen goedkeuring van eigen account.
- Een Discord-koppeling kent **geen Discord-rollen, personeelsrechten of toegangsrechten tot andere portaalmodules** toe.
- Rollen blijven via het afzonderlijke gebruikersbeheer en de bestaande goedkeuringsprocedure lopen.
- Geen Google Sheets-writes, geen LIVE Firebase-writes.
- De externe bot kan later de **actualiteit van leden en rollen** synchroniseren; het personeels-ID blijft onafhankelijk van de Discord-ID.

## Eerste handmatige test
- Fictieve persoon zonder Discord-ID aanmaken, bijvoorbeeld `Test Nieuwe Rekruut`, Politie, `TEST-P707`.
- Intern ID privé overdragen aan een testmedewerker.
- Die medewerker vraagt op de aparte koppelpagina toegang aan met een eigen Discord-login.
- Kaderlid verifieert de Discord-identiteit, keurt de koppeling goed.
- Controleren dat er precies één gekoppelde actieve personeelsfiche in de lijst staat, met bron **Nieuw in Firestore**, en dat het concept uit **Wacht op Discord-koppeling** verdwijnt.
- Controleren dat in het aparte gebruikersbeheer nog steeds een afzonderlijke toestemming nodig is voor personeelsdossiers.

Automatische CI is nog niet de volledige integratietest: controleer de hele keten op de testserver voordat code of flags richting productie gaan.
