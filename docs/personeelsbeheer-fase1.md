# Personeelsfiches vanuit het portaal – overgangsfase

## Functie
Open `/personeelsbeheer.html`. Kaderleden zien de bestaande personeelsfiches uit hun toegelaten hulpdiensten. Een officier of korpsleiding kan bestaande fiches binnen zijn of haar werkelijk geautoriseerde dienst wijzigen, met uitzondering van de eigen fiche of die van onbevoegd hogere kaderleden.

In deze **eerste fase** zijn alleen `name`, `call` en `status` wijzigbaar. Een wijziging krijgt een verplichte motivering en een revision-nummer in `bpd_personnel_edits/{dept}_{discordId}`. Iedere mutatie krijgt een aparte auditregistratie. Gelijktijdige overschrijvingen worden geweigerd op basis van de verwachte revision.

De velden `personId` / Discord ID, `dept`, `rank`, `series`, specialisaties en verdere rechten zijn niet via deze module wijzigbaar. Een promotie verloopt nog via het beveiligde dossier-/personeelsproces. Er worden **geen** Google Sheets-cellen aangepast of verwijderd.

## Uitrol / veiligheid
Nieuwe Render-flags (beide standaard **uit**):
- `BPD_ENABLE_PERSONNEL_WRITES=true` laat geautoriseerde nieuwe wijzigingen naar Firestore schrijven.
- `BPD_PERSONNEL_OVERRIDES_ACTIVE=true` laat de drie gecontroleerde velden bij gedeelde `getSnapshot()`-leesacties over de originele Sheets-projectie heen lezen.

Zet deze flags **nooit blind** aan op productie. Eerst in een geïsoleerde testomgeving testen met voorbeeldfiches en alle kaderrollen. Daarna brondata exporteren/archiveren en mutaties gecontroleerd introduceren. De applicatie toont bij uitgeschakelde schrijftoegang de volledige personeelsinformatie in voorbereidingsmodus, zonder mutatieknoppen.

De pagina toont reeds geregistreerde Firestore-wijzigingen als een aparte gegevensbron, ook wanneer gedeelde overschrijvingen nog niet actief zijn. Een tweede fase omvat nieuwe personeelsleden aanmaken, officiële graden/promoties, gespecialiseerde opleidingen, volledige imports en de finale omschakeling van Google Sheets als bron.

## Controlepunten
- Officier kan een lager kader binnen eigen dienst aanpassen, niet zichzelf, geen andere diensten, geen hoger kader en geen onbekende politiegradatie.
- Beveiliging controleert functies opnieuw op de server (niet op de browser).
- Test dat Firestore-audit en revisieverlies geen stille overschrijving toelaten.
- Na afzonderlijk inschakelen van `BPD_PERSONNEL_OVERRIDES_ACTIVE`: dashboard, verlof, weekrapporten en dossierkoppelingen lezen dezelfde veilige override zonder dat identiteit of rang wijzigen.
- Bewaar Sheets als terugvalbron tot alle historische gegevens en dossiers gecontroleerd zijn.
