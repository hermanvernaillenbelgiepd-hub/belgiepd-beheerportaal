# Specialisaties: kolommen, statussen en wijzigingsbevoegdheid

Personeelsbeheer toont op desktops de afzonderlijke specialisaties als **pictogram + naam in de kolomkop**. De status eronder is `Ja`, `Nee`, `Stage`, `Docent` of `Niet ingevuld` (onbekende oudere bronwaarden behouden hun letterlijke tekst).

Om een leesbare lijst zonder horizontale balk te behouden, opent een beschikbare hulpdienst als standaardfilter en gebruiken de tabellen vrijwel de volle browserbreedte. Bij de filter **Alle toegelaten diensten** verschijnt één gecombineerde samenvattingskolom omdat elke hulpdienst een eigen specialisatiecatalogus heeft. Op smallere mobiele vensters is horizontaal scrollen als toegankelijke terugval toegestaan; twaalf politiecategorieën zijn daar niet op natuurlijke grootte leesbaar.

De bron is voorlopig Google Sheets. De welbekende politie-specialisaties bevatten ook SRT en DSU, die in de huidige bron nog geen eigen kolom hebben; die krijgen daarom de expliciete status `Niet ingevuld` en nooit een geraden kwalificatie.

## Kaderwijzigingen

Een afzonderlijk Firestore-register `bpd_personnel_specializations/{dept}_{discordId}` bewaart wijzigingen zonder de Google Sheet, personeelsidentiteit, rang of Discord-rollen te overschrijven.

- **Middenkader:** inzage volgens dienstgebonden personeelsrechten; geen statuswijzigingen.
- **Officierenkader:** kan met motivering de specialisaties van een bevoegde, ondergeschikte medewerker in de eigen hulpdienst wijzigen; niet bij zichzelf of bij hogere rangen.
- **Korpsleiding:** idem, met bestaande dienst- en hiërarchiecontrole; technisch beheer blijft aan dezelfde identiteitscontrole onderworpen.
- **Audit:** vorige en nieuwe status, reden, actor, tijdstip, revisie, bron `manual`. Bots en Discord-rollen veranderen niet.
- **Concurrentie:** iedere schrijfopdracht vereist `expectedRevision`; dubbele of verouderde wijzigingen worden afgewezen.

Instellingen:
- `BPD_ENABLE_PERSONNEL_SPECIALTIES=true` leest de beschikbare statusoverlays en maakt de dossier-API zichtbaar.
- `BPD_ENABLE_PERSONNEL_SPECIALTY_WRITES=true` activeert, aanvullend op de eerste vlag, de wijzigingen vanuit het kader. Beide standaard UIT.
- Voor MAIN: leesvlag aan na validatie, schrijfwijzigingen UIT tot TEST met echte, afzonderlijke kaderaccounts is gecontroleerd.

## Toekomstige Discord-bot
Er is **nog geen bot-toegang of roltoekenningsendpoint**. Een gecontroleerde botintegratie krijgt later een eigen machine-authenticatie, rol-ID mapping, idempotente evenementen, bron `bot`, en een expliciet beleid voor het omgaan met handmatige kaderstatussen. Een Discord-rol of geslaagd opleidingsresultaat mag nooit zonder verificatie en audit tot een bestuurs- of personeelsbevoegdheid leiden.
