# BelgiumPD personeelslijst: rangen en specialisaties

Beide overzichten (`/` → personeelsbeheer/dashboard en `/personeelsbeheer.html`) gebruiken dezelfde presentatiehelper `public/personnel-list-visuals.js`.

## Kolommen
1. **Roepnummer** uit de officiële personeelsbron;
2. **Rangkenteken** voor herkende Belgische politiegraden (lokale politie);
3. **Naam van rang** uit de gekoppelde graadcode, voluit;
4. **Naam personeelslid** met hulpdienst als secundaire informatie;
5. **Reeks** uit de bestaande personeelsbron;
6. **Status** uit dezelfde bron;
7. **Specialisaties** als compacte pictogrammen met tekstuele tooltip, voor zover een positieve registratie bestaat.

Onbekende of niet-politierangen krijgen nooit een fictief Belgisch politiegraadkenteken. Onbekende graadnamen worden letterlijk behouden zodat fouten gecontroleerd kunnen worden.

### Graadkentekens en licentie
Voor bekende Belgische politierangen worden de **lokale politievarianten** van Wikimedia Commons gebruikt via `Special:FilePath`, met een vaste toelatingslijst van bestanden. Die beelden zijn van **Politie123**, licentie **CC BY-SA 4.0**:
- https://commons.wikimedia.org/wiki/Category:Police_rank_insignia_of_Belgium
- https://creativecommons.org/licenses/by-sa/4.0/

De beelden zijn externe presentatiemiddelen. Er worden geen externe API's met personeelsidentiteiten aangeroepen en afbeeldingen krijgen `referrerpolicy=no-referrer`. Voor volledig offline gebruik moeten deze geattribueerde SVG's later lokaal worden opgeslagen conform hun licentie.

### Specialisatiebron en beperkingen
- Hoofddashboard gebruikt reeds opgehaalde `normalizePersonnel` data (`specialties: [{label,value}]`).
- Het beschermde personeelsbeheer ontvangt dezelfde **geminimaliseerde** specialisatielabels en waarde uit `GET /api/personnel/overview` binnen de bestaande dienstgebonden autorisatie.
- Negatieve/onbekende/lege statussen tellen niet als kwalificatie.
- Dit zijn *registraties*, geen live Discord-koppeling of bevoegdheden; de toekomstige BPD-botintegratie kan een gevalideerde databron toevoegen, zonder de UI of schrijfrechten te moeten vervangen.
- De helper verandert geen personeelsgegevens, Discord-rollen, Firestore-documenten of toegangsrechten.

Er is een afzonderlijke regressietest voor rijvolgorde, 14 Belgisch-rangvarianten, uitzonderingsgevallen en specialisatiepictogrammen.
