# Centraal gebruikersbeheer (MVP)

De Discord-login van het BelgiumPD-beheerportaal blijft op applicatie-ID
`1561012661762789548` werken. Er is **geen Athena-bot-token of andere
Discord-secret** nodig voor deze module. Athena-rollen wijzigen we nog niet.

## Een medewerker toelaten

1. Het personeelslid logt met zijn of haar **eigen** Discord-account in.
2. Open `/gebruikersbeheer.html` en klik **Toegang aanvragen**.
3. Het portaal controleert een recente eigen Discord-verificatie en exact één
   actieve personeelsfiche per geverifieerde gewone dienst. Alleen bij een
   volledige overeenkomst wordt de beperkte portaalfunctie automatisch goedgekeurd
   en geaudit. Automatische toekenning geldt niet voor leiding, Bestuur of
   technische beheerders, en herstelt nooit een geblokkeerd account.
4. Bij ontbrekende of afwijkende gegevens volgt status `pending`. Een bevoegde
   officier of korpsleiding controleert dan de hulpdienst en kaderfunctie,
   vermeldt een reden en keurt de koppeling handmatig goed.
5. Een nieuwe `approved`-toewijzing geeft toegang binnen de goedgekeurde
   dienst(en) op dezelfde beveiligde backendroutes als de bestaande medewerkers.
6. Blokkering verandert de status in `blocked`, waardoor zowel de Discord-login
   als een eventueel gekoppelde oude Google-login geen personeelsrechten krijgt.

## Goedkeuringsbeleid

- Officierenkader: basiskader en middenkader van de eigen hulpdienst(en).
- Korpsleiding: ook officierenkader van de eigen hulpdienst(en).
- `beheerder` (legacy via `BPD_ACCESS_JSON`): overkoepelend, kan maximaal
  korpsleiding toekennen. De rol `beheerder` kan via het portaal niet worden
  gecreëerd.
- Niemand kan via deze module eigen rechten wijzigen of zichzelf blokkeren.
- Discord-rol-ID's alléén creëren **nooit** personeelsbevoegdheden; voor gewone
  functies zijn aanvullende actuele Discord-identiteit én een unieke actieve
  personeelsfiche vereist.
- Een verlopen Discord-verificatie wordt niet stilzwijgend verlengd.
- Elke goedkeuring, wijziging of blokkering bevat een verplichte reden en audit.

## Overgang vanaf Render

Goedgekeurde nieuwe accounts gebruiken Firestore in plaats van
`BPD_ACCESS_JSON`. Bestaande medewerkers zonder Firestore-document blijven hun
bestaande rechten gebruiken. Voor de **zelfde** Discord-ID heeft een Firestore-
beslissing voorrang op de legacy allowlist: ingetrokken rechten worden niet
hersteld via de Google-noodlogin.

De bestaande Google Sheets dienen nog als personeelsbron in de dossier- en
verlofmodules. Deze fase migreert **geen** personeelsrecords en voert geen
wijzigingen uit aan Google Sheets of Discord-serverrollen.

## Technische aandachtspunten

- Nieuw Firestore-overzicht is voorlopig begrensd op 250 gebruikers; een
  vervolgversie moet paginering toevoegen.
- Een aanvraag vereist maximaal 15 minuten oude Discord-verificatie.
- Personeelsacties hanteren maximaal zeven dagen geldige
  Discord-lidmaatschapsverificatie; de bot kan dit later actueel houden.
- Acties lopen uitsluitend via Firebase-ID-tokens en servercontrole. Nooit
  API-tokens rechtstreeks in de browser plaatsen.
- Nieuw portaalpersoneel zonder Google-account heeft geen automatisch
  `email`-veld. Oudere modules die nog expliciet Google-email vereisen (zoals
  toekenning van sommige verlofdelegaties) migreren later naar Discord-ID.
- De oude `BPD_ACCESS_JSON` moet pas worden verwijderd nadat een afzonderlijk,
  gecontroleerd migratietraject ook de technische beheerder heeft overgezet.
