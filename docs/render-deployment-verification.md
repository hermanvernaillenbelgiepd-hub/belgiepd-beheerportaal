# Render: gecontroleerd van GitHub MAIN naar live service

De openbare health-route `GET /api/health` toont veilig:
- `status: "ok"`: het HTTP-proces antwoordt.
- `integration`: er zijn ooit Sheets-gegevens in dit proces geladen of nog niet.
- `deployment.commit`: de door Render gedeployde git-revisie (40 hex tekens), of `null` buiten Render.
- `deployment.branch`: de branch van de gedeployde build (zoals `main`), of `null`.

Render biedt hiervoor automatisch `RENDER_GIT_COMMIT` en `RENDER_GIT_BRANCH` aan, zonder nieuwe environment variables of geheimen. Het health-resultaat deelt **geen** API-tokens, Firestore-documenten, private persoonsgegevens, roltoewijzingen of secrets.

## Check met GitHub

1. Controleer in GitHub de huidige `main` commit.
2. Vraag `https://belgiepd-beheerportaal.onrender.com/api/health` op.
3. Alleen als `deployment.branch === "main"` en `deployment.commit` overeenkomt met de gewenste GitHub-revisie, is die codeversie werkelijk op MAIN gedeployed.
4. Herhaal op `https://belgiepd-beheerportaal-testserver.onrender.com/api/health`, met de verwachte TEST-branch en afzonderlijk Firebase-project. Sommige testomgevingen gebruiken `main` met andere configuratie; controleer daarom de *echte* Render branchinstelling voor je gaat uitrollen.

`/api/health` bewijst **niet** dat alle beveiligde workflows of Firebase-schrijfacties werken; daarvoor zijn afzonderlijke rol- en API-tests nodig.

## Feature-activering: gescheiden van code-deployment

Een code-merge activeert de modules niet vanzelf. In iedere afzonderlijke Render-omgeving:
- `BPD_ENABLE_DOSSIER_CENTER=true` activeert het alleen-lezen dossiercentrum.
- `BPD_ENABLE_PERSONNEL_RANK_CHANGES=true` activeert gecontroleerde promoties op nieuwe, gekoppelde politie-Firestore-fiches; de personeelsdataschakelaar blijft een tweede voorwaarde.

**Laat de laatste drie functies UIT** totdat de bevoegdheden en de werkelijke bot-/FireStore-bronnen gecontroleerd zijn. Test toegang met een toegelaten burger, een politie-kaderlid en een kaderlid van een andere hulpdienst. Test nooit met fictieve FiveM-uren in MAIN.

## Belangrijk

De GitHub Actions-codecontrole voert Node-tests uit. De aanvullende publieke Render-smoketests staan bewust op `continue-on-error`: een groene GitHub CI betekent niet dat de nieuwste versie al is gedeployed. Vergelijk altijd de twee revision strings of raadpleeg het Render-deploymentoverzicht.
