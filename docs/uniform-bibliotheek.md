# BelgiumPD uniformbibliotheek — TEST-first

## Opslag en activering
Nieuwe afbeeldingen worden als originele PNG, JPEG of WebP (maximaal 4 MiB) in een Firebase Cloud Storage bucket opgeslagen. Oude WebP-afbeeldingen in Firestore blijven werken. Er wordt niets openbaar gemaakt via een bucket-URL; het bestaande portaalendpoint serveert actieve bestanden.

Maak voor TEST en MAIN **verschillende buckets** in hun respectieve Firebase-projecten. Stel uitsluitend op de bijbehorende Render-service de omgevingsvariabele BPD_UNIFORM_LIBRARY_BUCKET in op de naam van de correcte bestaande bucket. Er hoort geen account-sleutel in GitHub. De serveridentiteit moet lees- en schrijfrechten op de juiste bucket hebben.

Zonder deze instelling blijft uploaden via de nieuwe bibliotheek bewust uitgeschakeld. Het oude logobeheer blijft toegankelijk.

## Verzamelingen en selectielogica
- bpd_role_artwork_meta: huidige metadata en verwijzing naar Cloud Storage of oudere Firestore-afbeelding
- bpd_uniform_library_versions: versies en verwijzingen naar eerdere afbeeldingen
- bpd_role_artwork_audit: logboek uploads, vervangingen, herstel
- bpd_uniform_library_rules: visual-only koppeling met dienst, kader, graad of persoon
- bpd_uniform_library_rule_audit: logging voor koppelingen en verwijderen

Voorrang bij selectie: personeelslid > graad > kader > hulpdienst. Gebruik bij personen bij voorkeur een stabiele Discord-ID. De bediening laat een roepnummerfallback toe, die na een wijziging opnieuw moet worden gecontroleerd.

Een nieuwe gradenplaat verschijnt op de bestaande plaats voor de graad. Voor helmen, beroepsbadges en extra logo's moet de gewenste positie eerst in Uniformbeheer > Extra lagen worden geconfigureerd. Het tonen van medailles vereist altijd een aparte, bevoegde toekenning.

## Werkwijze
1. Open Gebruikersbeheer > Centrale bibliotheek > Bibliotheek met originele afbeeldingen.
2. Kies dienst, soort, code en naam. Upload een afbeelding. Herhaal met dezelfde code om een nieuwe versie te bewaren.
3. Ga naar Uniformbeheer > Graden, helmen en logo's selecteren. Kies doelpersoon, graad, kader of de hele dienst.
4. Gebruik Extra lagen voor de gewenste plaats van helm, beroepsteken of extra logo.
5. Herstel oude afbeeldingen via Versiehistoriek wanneer nodig.

## TEST-afhandeling
- npm test en npm run check uitvoeren.
- Firebase-project van Render TEST en toegewezen TEST-bucket bevestigen.
- Upload, vervanging, herstel en individuele toewijzing testen.
- Oude afbeeldingen, de politieportretten en alle hulpdiensten visueel controleren.
- Pas na expliciete controle en akkoord MAIN bijwerken en MAIN-bucket configureren.

## Uniformgroepen versus herkenningstekens

Een basisuniform mag meerdere graden of functies bedienen. Het uniform bepaalt
nooit zelf de graad. De visuele rang-/functieaanduiding wordt altijd apart gekozen.

**Politie**: de configureerbare uniformgroep `basis_tm_ahinp` omvat 100-, 200-,
300-, 400-, 500- en 600-reeksen (tot en met Aspirant Hoofdinspecteur).
Dit is een kledinggroep, **niet** een organisatorisch kader: A-HINP blijft
Middenkader. De aparte optionele groepen `hinp_1hinp` en `officieren`
zijn beschikbaar, zonder dat ze bestaande uniformen automatisch vervangen.
De gradenplaat kan geselecteerd worden per callreeks: 100, 200, 300, 400, 500,
600, 700, 800, 900, 910, 920 en 930; expliciete individuele afwijkingen
blijven mogelijk.

**Brandweer**: het uniform blijft herbruikbaar per dienst of kader, terwijl een
gradenteken of helm gekoppeld wordt aan de naam van de effectieve graad,
bijvoorbeeld `sergeant` of `adjudant`.

**Ambulance**: het beroepsteken wordt gekoppeld aan de functiecode
`ambulancier`, `vpk`, `arts` of `dirmed`.
AMB/HAMB gebruiken ambulancier, VPK/HVPK gebruiken vpk, ARTS/HARTS gebruiken
arts en DIRMED krijgt de aanduiding DIRMED. Zonder geüploade passende
functielaag wordt voor DIRMED een tekstopschrift getoond. Dit wijzigt
geen erkende beroepskwalificatie.

Voor getekende helmen en beroepsbadges blijft de bestaande instelling
**Uniformbeheer > Extra lagen** noodzakelijk om de plaats te bepalen.
Selectievolgorde: persoonlijk > callreeks/hoedanigheid > graad > kader > dienst.
Uniformselectie: persoonlijk > specifieke graad > hoedanigheid/uniformgroep >
kader > dienst.
