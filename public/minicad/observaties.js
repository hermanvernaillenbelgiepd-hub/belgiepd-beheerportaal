/* =====================================================================
   observaties.js  -  module "Observaties" (enkel TO-MINICAD)

   Wat doet dit?
   Tijdens de dienst snel kladnotities maken over politieploegen, als
   leidraad voor het definitieve observatieverslag dat de TO achteraf zelf
   schrijft. Alles blijft op deze pc (localStorage) tot "Nieuwe sessie".

   Hoe wordt dit geladen?
   index.html laadt dit bestand (en observaties.css) ALLEEN in TO-MINICAD.
   In DISPATCHING en TO-DIENSTPANEEL bestaat de module niet.

   Wat gebruikt dit uit index.html?
   - units, incidentData, render(), openDialog(), GEKOZEN_PROGRAMMA,
     SYNC_URL en SYNC_TOKEN (adres van je Cloudflare Worker)
   Haken die index.html naar deze module toe heeft:
   - Observaties.tegel(unit, tegelDiv)   bij het tekenen van elke ploegtegel
   - Observaties.radioUpdate(lijst)      bij elke radio-ronde (los van Sonoran:
                                         elke lijst met { id, naam, roepnummer,
                                         speler, ster } volstaat)
   - Observaties.aantal() / voorNieuweSessie() / wis()   bij "Nieuwe sessie"

   Personeelslijst: komt via de Worker (GET /personeel) uit het Google Sheet
   "Administratie BelgiePD", tabblad POLITIE (Callsign, Naam, Reeks).
   ===================================================================== */
(function(){
"use strict";

if(typeof GEKOZEN_PROGRAMMA === "undefined" || GEKOZEN_PROGRAMMA !== "to") return;
if(window.Observaties) return;

/* ---- Instellingen -------------------------------------------------------- */
const SOORTEN = ["Positief", "Werkpunt", "Neutraal"];
const LABELS  = ["Radioprocedure", "Communicatie", "Rijgedrag", "Samenwerking", "RP-kwaliteit", "Kennis procedures"];

/* Observaties kunnen enkel voor roepnummers van MIN_NR tot en met MAX_NR (hogere nummers, zoals 600+, niet).
   Uitzondering: rijdt iemand van 600+ mee met een koppelmaat uit dat bereik, dan kan er wel een observatie
   voor die koppelmaat genoteerd worden (de 600+ zelf blijft uitgesloten). */
const MIN_NR = 100;
const MAX_NR = 599;
const inBereik = (nr) => { const n = Number(nr); return n >= MIN_NR && n <= MAX_NR; };

const VENSTER_VOORSTEL_MS = 90 * 1000;      /* "ongeveer hetzelfde moment" */
const BEWAAR_VERDWENEN_MS = 10 * 60 * 1000;

const K_OBS   = "dispatchObservaties";
const K_MEER  = "dispatchObsMeerijders";
const K_KOPIE = "dispatchObsGekopieerd";
const K_PERS  = "dispatchObsPersoneel";

/* ---- Opslag -------------------------------------------------------------- */
function laad(sleutel, standaard){
    try{
        const t = localStorage.getItem(sleutel);
        if(!t) return standaard;
        const w = JSON.parse(t);
        return (w && typeof w === typeof standaard) ? w : standaard;
    }catch(e){ return standaard; }
}
function bewaar(sleutel, waarde){
    try{ localStorage.setItem(sleutel, JSON.stringify(waarde)); }catch(e){}
}

let obs    = laad(K_OBS, []);       /* alle observaties van deze sessie */
let meer   = laad(K_MEER, {});      /* { tegelSleutel: [{ k, callsign, naam, reeks }] } */
let kopie  = laad(K_KOPIE, {});     /* { persoonSleutel: handtekening bij het laatste kopiëren } */
if(!Array.isArray(obs)) obs = [];

/* ---- Personeelslijst ----------------------------------------------------- */
let personeel = { lijst: [], tijd: 0, fout: "", bezig: false };
let perNr = new Map();              /* nummer ("420") → { callsign, naam, reeks } */

(function(){
    const c = laad(K_PERS, null);
    if(c && Array.isArray(c.lijst)){ personeel.lijst = c.lijst; personeel.tijd = c.tijd || 0; }
})();

/* "SANTO-420", "420*", "420" → "420" (laatste getal). Leeg als er geen is. */
function nummerVan(tekst){
    const m = /(\d+)\s*\*?\s*$/.exec(String(tekst || "").trim());
    return m ? String(Number(m[1])) : "";
}

function bouwNummers(){
    perNr = new Map();
    personeel.lijst.forEach(p => {
        const nr = nummerVan(p.callsign);
        if(nr && inBereik(nr)) perNr.set(nr, p);
    });
}
bouwNummers();

/* ---- Personeelslijst rechtstreeks uit het Google Sheet (enkel in de app) -------
   In de Windows-app haalt Rust het Sheet als CSV op (geen CORS, geen Worker nodig).
   Het adres staat bij PERSONEEL_BRON in index.html. De kolommen worden op hun kop herkend. */
function leesCsv(tekst){
    const rijen = [];
    let rij = [], veld = "", tussen = false;
    for(let i = 0; i < tekst.length; i++){
        const c = tekst[i];
        if(tussen){
            if(c === '"' && tekst[i + 1] === '"'){ veld += '"'; i++; }
            else if(c === '"') tussen = false;
            else veld += c;
        }else if(c === '"'){ tussen = true; }
        else if(c === ","){ rij.push(veld); veld = ""; }
        else if(c === "\n" || c === "\r"){
            if(c === "\r" && tekst[i + 1] === "\n") i++;
            rij.push(veld); veld = ""; rijen.push(rij); rij = [];
        }else veld += c;
    }
    if(veld !== "" || rij.length){ rij.push(veld); rijen.push(rij); }
    return rijen;
}

function personeelUitCsv(tekst){
    const rijen = leesCsv(String(tekst).replace(/^﻿/, ""));
    const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const CALL = ["callsign", "roepnummer", "roepnaam", "call"];
    const NAAM = ["naam", "name", "speler", "voornaamachternaam"];
    const REEKS = ["reeks", "ploeg", "series"];
    const vind = (k, lijst) => {
        let i = k.findIndex(c => lijst.includes(c));
        if(i < 0) i = k.findIndex(c => c && lijst.some(l => c.startsWith(l)));
        return i;
    };

    let kop = -1;
    for(let i = 0; i < Math.min(rijen.length, 30); i++){
        if(vind(rijen[i].map(norm), CALL) >= 0){ kop = i; break; }
    }
    if(kop < 0) throw new Error("Kolom Callsign niet gevonden in het Sheet (is het adres of het tabblad juist, en is het Sheet openbaar?)");

    let start = kop + 1;
    const zoek = (lijst) => {
        for(let j = kop; j < Math.min(rijen.length, kop + 3); j++){
            const i = vind(rijen[j].map(norm), lijst);
            if(i >= 0){ start = Math.max(start, j + 1); return i; }
        }
        return -1;
    };
    const iCall = zoek(CALL);
    const iNaam = zoek(NAAM);
    let iReeks = zoek(REEKS);
    if(iReeks < 0 && iNaam >= 0 && rijen[kop].length > iNaam + 1 && norm(rijen[kop][iNaam + 1]) === "") iReeks = iNaam + 1;
    if(iNaam < 0) throw new Error("Kolom Naam niet gevonden in het Sheet");

    const uit = [];
    for(let i = start; i < rijen.length; i++){
        const r = rijen[i];
        const callsign = String(r[iCall] || "").trim();
        const naam = String(r[iNaam] || "").trim();
        if(!callsign || !naam) continue;
        uit.push({ callsign: callsign, naam: naam, reeks: iReeks >= 0 ? ((String(r[iReeks] || "").trim().match(/^[A-Za-z0-9]+/) || [""])[0]) : "" });
    }
    return uit;
}

function inApp(){
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__ || window.__TAURI_INVOKE__);
}

function laadPersoneel(vers){

    if(personeel.bezig) return Promise.resolve();

    /* In het portaal: de personeelslijst van het portaal zelf (/api/member/personnel-list) */
    if(typeof window.BPD_PERSONEEL_PROXY === "function"){

        personeel.bezig = true;
        zetPersStatus();

        return window.BPD_PERSONEEL_PROXY()
            .then(lijst => {
                if(!lijst.length) throw new Error("De personeelslijst van het portaal is leeg");
                personeel.lijst = lijst;
                personeel.tijd = Date.now();
                personeel.fout = "";
                bewaar(K_PERS, { lijst: personeel.lijst, tijd: personeel.tijd });
                bouwNummers();
            })
            .catch(e => {
                personeel.fout = (e && e.message) || String(e || "Lijst ophalen mislukt.");
            })
            .finally(() => {
                personeel.bezig = false;
                zetPersStatus();
                herteken();
            });
    }

    /* In de app: rechtstreeks uit het Sheet via Rust */
    if(inApp() && typeof PERSONEEL_BRON !== "undefined" && PERSONEEL_BRON && typeof tauriInvoke === "function"){

        personeel.bezig = true;
        zetPersStatus();

        /* PERSONEEL_BRON mag één adres zijn of een lijst: het eerste adres dat werkt wint */
        const adressen = [].concat(PERSONEEL_BRON);
        let laatsteFout = null;
        const probeer = (i) => tauriInvoke("sonoran_proxy_get", { url: adressen[i], token: "" })
            .then(tekst => {
                if(/^\s*<(!doctype|html|style)/i.test(String(tekst))) throw new Error("Google vraagt om in te loggen: het Sheet is niet openbaar leesbaar via dit adres");
                return tekst;
            })
            .catch(e => {
                laatsteFout = e;
                if(i + 1 < adressen.length) return probeer(i + 1);
                throw (e && e.message && /^HTTP 40[13]/.test(e.message)) ? new Error("Google vraagt om in te loggen: het Sheet is niet openbaar leesbaar via dit adres") : e;
            });

        return probeer(0)
            .then(tekst => {
                const lijst = personeelUitCsv(tekst);
                if(!lijst.length) throw new Error("De lijst in het Sheet is leeg");
                personeel.lijst = lijst;
                personeel.tijd = Date.now();
                personeel.fout = "";
                bewaar(K_PERS, { lijst: personeel.lijst, tijd: personeel.tijd });
                bouwNummers();
            })
            .catch(e => {
                personeel.fout = (e && e.message) || String(e || "Lijst ophalen mislukt.");
            })
            .finally(() => {
                personeel.bezig = false;
                zetPersStatus();
                herteken();
            });
    }

    if(typeof SYNC_URL === "undefined" || !SYNC_URL){
        personeel.fout = "Geen bron voor de personeelslijst ingesteld (PERSONEEL_BRON of SYNC_URL in index.html).";
        zetPersStatus();
        return Promise.resolve();
    }

    personeel.bezig = true;
    zetPersStatus();

    const hoofd = {};
    if(typeof SYNC_TOKEN !== "undefined" && SYNC_TOKEN) hoofd["X-App-Token"] = SYNC_TOKEN;

    const ctrl = new AbortController();
    const stop = setTimeout(() => ctrl.abort(), 12000);

    return fetch(String(SYNC_URL).replace(/\/+$/, "") + "/personeel" + (vers ? "?vers=1" : ""), { headers: hoofd, cache: "no-store", signal: ctrl.signal })
        .then(r => r.text().then(t => {
            let d = null;
            try{ d = JSON.parse(t); }catch(e){}
            if(!r.ok || !d || !Array.isArray(d.personen)) throw new Error((d && d.error) || ("Server antwoordde " + r.status));
            personeel.lijst = d.personen
                .filter(p => p && p.callsign && p.naam)
                .map(p => ({ callsign: String(p.callsign).trim(), naam: String(p.naam).trim(), reeks: String(p.reeks || "").trim() }));
            personeel.tijd = Date.now();
            personeel.fout = "";
            bewaar(K_PERS, { lijst: personeel.lijst, tijd: personeel.tijd });
            bouwNummers();
        }))
        .catch(e => {
            personeel.fout = (e && e.name === "AbortError") ? "De server antwoordt niet." : (e && e.message) || "Lijst ophalen mislukt.";
        })
        .finally(() => {
            clearTimeout(stop);
            personeel.bezig = false;
            zetPersStatus();
            herteken();
        });
}

function uurTekst(ms){
    return new Date(ms).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
}

function zetPersStatus(){
    document.querySelectorAll(".obsPersStatus").forEach(e => {
        let t;
        if(personeel.bezig) t = "Personeelslijst ophalen…";
        else if(personeel.fout) t = "Personeelslijst: " + personeel.fout + (personeel.lijst.length ? " (laatste bekende lijst in gebruik)" : "");
        else if(personeel.tijd) t = "Personeelslijst: " + personeel.lijst.length + " personen, bijgewerkt om " + uurTekst(personeel.tijd);
        else t = "Personeelslijst nog niet geladen.";
        e.textContent = t;
        e.classList.toggle("fout", !!personeel.fout && !personeel.bezig);
    });
}

/* ---- Radio: wie is er, wie verschijnt, wie verdwijnt --------------------- */
let actief = [];                    /* laatste lijst: [{ id, naam, roepnummer, speler, ster }] */
let vorige = null;                  /* Map sleutel → item van de vorige ronde */
let verdwenen = [];                 /* [{ t, e }] niet-ster items die verdwenen zijn */
const gezien = new Map();           /* sleutel van een ster-item → tijdstip waarop het verscheen (0 = onbekend) */

function itemSleutel(e){
    return [e.id || "", String(e.roepnummer || "").toUpperCase(), String(e.speler || "").toLowerCase(), e.ster ? "*" : ""].join("|");
}

function radioUpdate(lijst){

    if(!Array.isArray(lijst)) return;

    const nu = Date.now();
    const nieuw = new Map();
    lijst.forEach(e => {
        if(!e || !e.roepnummer) return;
        const item = { id: e.id || "", naam: String(e.naam || ""), roepnummer: String(e.roepnummer), speler: String(e.speler || ""), ster: !!e.ster };
        nieuw.set(itemSleutel(item), item);
    });

    /* Een lege lijst terwijl er net nog mensen waren? Waarschijnlijk een storing: negeren */
    if(vorige && vorige.size > 3 && nieuw.size === 0) return;

    if(vorige){
        vorige.forEach((e, k) => {
            if(!nieuw.has(k) && !e.ster) verdwenen.push({ t: nu, e: e });
        });
        nieuw.forEach((e, k) => {
            if(!vorige.has(k) && e.ster) gezien.set(k, nu);
        });
    }else{
        nieuw.forEach((e, k) => { if(e.ster) gezien.set(k, 0); });
    }

    verdwenen = verdwenen.filter(v => nu - v.t <= BEWAAR_VERDWENEN_MS).slice(-60);

    const voor = JSON.stringify(Array.from(nieuw.keys()).sort());
    const was  = vorige ? JSON.stringify(Array.from(vorige.keys()).sort()) : "";

    vorige = nieuw;
    actief = Array.from(nieuw.values());

    if(voor !== was) herteken();
}

/* Voorstel voor een meerijder: wie verdween ongeveer toen "420*" verscheen? */
function voorstelVoor(sterItem){

    const t0 = gezien.get(itemSleutel(sterItem));
    if(!t0) return null;

    let beste = null;
    let besteScore = -Infinity;

    verdwenen.forEach(v => {
        const dt = Math.abs(v.t - t0);
        if(dt > VENSTER_VOORSTEL_MS) return;
        if(String(v.e.roepnummer).toUpperCase() === String(sterItem.roepnummer).toUpperCase()) return;
        if(actief.some(a => itemSleutel(a) === itemSleutel(v.e))) return;      /* is er al terug */

        let score = -dt / 1000;
        if(v.e.id && sterItem.id && v.e.id === sterItem.id) score += 100;
        if(v.e.speler && sterItem.speler && v.e.speler.toLowerCase() === sterItem.speler.toLowerCase()) score += 50;

        if(score > besteScore){ besteScore = score; beste = v.e; }
    });

    if(!beste) return null;

    const nr = nummerVan(beste.roepnummer);
    if(nr && !inBereik(nr)) return null;
    const p = nr ? perNr.get(nr) : null;
    if(p) return { callsign: p.callsign, naam: p.naam, reeks: p.reeks };
    return { callsign: nr || beste.roepnummer, naam: beste.speler || "", reeks: "" };
}

/* ---- Welke ploegen en personen? ------------------------------------------ */
function tegelSleutel(unit){
    return String(unit.radioKey && !String(unit.radioKey).startsWith("P:") ? unit.radioKey : unit.naam).toUpperCase();
}

function isPolitie(unit){

    if(!unit || unit.dienst !== "Politie") return false;

    const nr = nummerVan(tegelSleutel(unit));
    if(!nr) return false;
    if(inBereik(nr)) return true;

    /* 600+ met een koppelmaat: enkel zolang er een meerijder is (of al gekozen werd) */
    return Number(nr) > MAX_NR && heeftMeerijder(tegelSleutel(unit));
}

function heeftMeerijder(sleutel){
    if(actief.some(e => e.ster && String(e.roepnummer).toUpperCase() === sleutel)) return true;
    return (meer[sleutel] || []).some(m => inBereik(nummerVan(m.callsign)));
}

function itemKey(e){ return e.id || ("n:" + String(e.speler || "").toLowerCase()); }

function persoonObj(callsign, naam, reeks){
    const cs = String(callsign || "").trim();
    const nm = String(naam || "").trim();
    return {
        sleutel: perNr.has(nummerVan(cs)) && perNr.get(nummerVan(cs)).callsign === cs
            ? "p:" + cs
            : "r:" + cs + ":" + nm.toLowerCase(),
        callsign: cs, naam: nm, reeks: String(reeks || "").trim()
    };
}

/* Wie zit er op deze tegel?  → { personen: [...], onbekend: [ster-items zonder gekozen meerijder] } */
function tegelInfo(unit){

    const sleutel = tegelSleutel(unit);
    const nr = nummerVan(sleutel);
    const items = actief.filter(e => String(e.roepnummer).toUpperCase() === sleutel);
    const gewoon = items.filter(e => !e.ster);
    const sterren = items.filter(e => e.ster);

    const personen = [];
    const voegToe = (p) => { if(!personen.some(x => x.sleutel === p.sleutel)) personen.push(p); };

    const lijstPersoon = perNr.get(nr);

    if(!inBereik(nr)){
        /* 600+: zelf geen observatie, enkel de koppelmaat (zie hieronder) */
    }else if(lijstPersoon){
        voegToe(persoonObj(lijstPersoon.callsign, lijstPersoon.naam, lijstPersoon.reeks));
    }else{
        /* 100-199: staat niet op de lijst, geen reeks, naam uit de radiodata */
        if(gewoon.length){
            gewoon.forEach(e => voegToe(persoonObj(nr, e.speler, "")));
        }else{
            voegToe(persoonObj(nr, "", ""));
        }
    }

    const onbekend = [];
    const opgeslagen = meer[sleutel] || [];

    sterren.forEach(e => {
        const m = opgeslagen.find(x => x.k === itemKey(e));
        if(m){ if(inBereik(nummerVan(m.callsign))) voegToe(persoonObj(m.callsign, m.naam, m.reeks)); }
        else onbekend.push(e);
    });

    return { sleutel: sleutel, nr: nr, personen: personen, onbekend: onbekend };
}

function persoonTekst(p){
    return p.naam ? (p.callsign + " | " + p.naam) : p.callsign;
}

function tegelTelling(sleutel){
    const groepen = new Set();
    obs.forEach(o => { if(o.unit === sleutel) groepen.add(o.groep); });
    return groepen.size;
}

/* ---- Kleine hulpjes voor de opbouw van vensters -------------------------- */
function el(tag, klasse, tekst){
    const e = document.createElement(tag);
    if(klasse) e.className = klasse;
    if(tekst !== undefined && tekst !== null) e.textContent = tekst;
    return e;
}

function herteken(){
    try{ if(typeof render === "function") render(); }catch(e){}
    werkKnopBij();
    if(open("obsKlad")) tekenKlad();
}

function maakModal(id, breed){
    let m = document.getElementById(id);
    if(m) return m;
    m = el("div", "modal obsModal" + (breed ? " breed" : ""));
    m.id = id;
    m.appendChild(el("div", "modalContent"));
    m.addEventListener("mousedown", (e) => { if(e.target === m) sluit(id); });
    document.body.appendChild(m);
    return m;
}
function inhoud(id){ const c = document.getElementById(id).querySelector(".modalContent"); c.innerHTML = ""; return c; }
function toon(id){ document.getElementById(id).style.display = "flex"; }
function sluit(id){ const m = document.getElementById(id); if(m) m.style.display = "none"; }
function open(id){ const m = document.getElementById(id); return !!m && m.style.display === "flex"; }

document.addEventListener("keydown", (e) => {
    if(e.key !== "Escape") return;
    ["obsMeer", "obsForm", "obsKlad"].some(id => { if(open(id)){ sluit(id); return true; } return false; });
});

/* ---- Haak: de knop op de ploegtegel -------------------------------------- */
function tegel(unit, div){

    if(!isPolitie(unit)) return;

    const info = tegelInfo(unit);
    const n = tegelTelling(info.sleutel);

    div.classList.add("obsTegel");

    const knop = el("button", "obsKnop" + (n ? " heeft" : ""));
    knop.type = "button";
    knop.title = "Observatie noteren" + (n ? " (" + n + " genoteerd)" : "");
    knop.setAttribute("aria-label", "Observatie noteren voor " + info.sleutel);
    knop.appendChild(document.createTextNode("✎"));
    if(n) knop.appendChild(el("span", "obsTel", String(n)));

    /* De tegel zelf wisselt de status bij een klik: dat mag hier niet gebeuren */
    ["click", "mousedown", "mouseup", "auxclick", "dblclick", "contextmenu", "pointerdown"].forEach(naam => {
        knop.addEventListener(naam, (e) => {
            e.stopPropagation();
            if(naam === "contextmenu" || naam === "mousedown") e.preventDefault();
        });
    });
    if(info.personen.length){
        knop.addEventListener("click", () => openFormulier(unit));
        div.appendChild(knop);
    }else if(info.onbekend.length){
        /* 600+ met een meerijder die nog niet gekozen is: eerst de koppelmaat kiezen, dan het formulier */
        knop.addEventListener("click", () => {
            vraagMeerijder(unit, info.onbekend[0]).then(ok => { if(ok){ herteken(); openFormulier(unit); } });
        });
        div.appendChild(knop);
    }

    if(info.onbekend.length){
        const w = el("div", "obsWaarsch", "⚠ meerijder onbekend");
        w.title = "Klik om te kiezen wie er meerijdt";
        ["click", "mousedown", "auxclick", "contextmenu"].forEach(naam => w.addEventListener(naam, (e) => e.stopPropagation()));
        w.addEventListener("click", () => { vraagMeerijder(unit, info.onbekend[0]).then(ok => { if(ok) herteken(); }); });
        div.appendChild(w);
    }
}

/* ---- Meerijder kiezen ----------------------------------------------------- */
function vraagMeerijder(unit, sterItem){

    return new Promise(resolve => {

        const sleutel = tegelSleutel(unit);
        const nr = nummerVan(sleutel);
        const voorstel = voorstelVoor(sterItem);

        maakModal("obsMeer");
        const c = inhoud("obsMeer");

        const kop = el("div", "modalHead");
        kop.appendChild(el("h3", "", "Wie rijdt mee met " + (nr || sleutel) + "?"));
        kop.appendChild(el("p", "obsSub", "De radio toont de meerijder als “" + (sterItem.naam || (sterItem.roepnummer + "*")) + "”, zijn echte roepnummer is onbekend. De keuze geldt voor de rest van de sessie."));
        c.appendChild(kop);

        const klaar = (p) => {
            const lijst = meer[sleutel] || (meer[sleutel] = []);
            const k = itemKey(sterItem);
            const i = lijst.findIndex(x => x.k === k);
            const rec = { k: k, callsign: p.callsign, naam: p.naam, reeks: p.reeks || "" };
            if(i >= 0) lijst[i] = rec; else lijst.push(rec);
            bewaar(K_MEER, meer);
            sluit("obsMeer");
            resolve(true);
        };

        if(voorstel){
            const v = el("div", "obsVoorstel");
            const t = el("div");
            t.appendChild(document.createTextNode("Voorstel: "));
            t.appendChild(el("b", "", persoonTekst(voorstel)));
            v.appendChild(t);
            const ja = el("button", "btnPrimary", "Klopt");
            ja.type = "button";
            ja.onclick = () => klaar(voorstel);
            v.appendChild(ja);
            c.appendChild(v);
        }

        const veld = el("div", "obsVeld");
        veld.appendChild(el("span", "obsLabel", voorstel ? "Of zoek op roepnummer of naam" : "Zoek op roepnummer of naam"));
        const zoek = el("input");
        zoek.type = "search";
        zoek.placeholder = "Roepnummer of naam";
        zoek.autocomplete = "off";
        zoek.spellcheck = false;
        veld.appendChild(zoek);
        const res = el("div", "obsZoekLijst");
        veld.appendChild(res);
        c.appendChild(veld);

        const teken = () => {
            res.innerHTML = "";
            const q = zoek.value.trim().toLowerCase();
            if(!q) return;

            const gevonden = personeel.lijst
                .filter(p => inBereik(nummerVan(p.callsign)))
                .filter(p => p.callsign.toLowerCase().includes(q) || p.naam.toLowerCase().includes(q))
                .sort((a, b) => (a.callsign.toLowerCase() === q ? -1 : 0) - (b.callsign.toLowerCase() === q ? -1 : 0))
                .slice(0, 8);

            gevonden.forEach(p => {
                const b = el("button", "obsZoekItem", persoonTekst(p));
                b.type = "button";
                b.onclick = () => klaar(p);
                res.appendChild(b);
            });

            if(!gevonden.length){
                res.appendChild(el("div", "obsLeeg", personeel.lijst.length ? "Niemand gevonden op de lijst." : "De personeelslijst is niet geladen."));
            }

            const eigen = el("button", "obsZoekItem", "Gebruik “" + zoek.value.trim() + "” als naam (staat niet op de lijst)");
            eigen.type = "button";
            eigen.onclick = () => klaar({ callsign: nr ? nr + "*" : "?", naam: zoek.value.trim(), reeks: "" });
            res.appendChild(eigen);
        };
        zoek.addEventListener("input", teken);

        const knoppen = el("div", "obsKnoppen");
        const nee = el("button", "", "Annuleren");
        nee.type = "button";
        nee.onclick = () => { sluit("obsMeer"); resolve(false); };
        knoppen.appendChild(nee);
        c.appendChild(knoppen);

        toon("obsMeer");
        setTimeout(() => zoek.focus(), 30);
    });
}

/* ---- Formulier "Observatie" ------------------------------------------------ */
function openFormulier(unit){

    const info = tegelInfo(unit);

    /* Eerst weten wie er meerijdt, anders weet de notitie niet bij wie ze hoort */
    if(info.onbekend.length){
        vraagMeerijder(unit, info.onbekend[0]).then(ok => { if(ok){ herteken(); openFormulier(unit); } });
        return;
    }

    maakModal("obsForm");
    const c = inhoud("obsForm");

    const kop = el("div", "modalHead");
    kop.appendChild(el("h3", "", "Observatie · " + info.sleutel));
    kop.appendChild(el("p", "obsSub", "Kladnotitie voor het verslag achteraf. Het tijdstip wordt automatisch genoteerd."));
    c.appendChild(kop);

    const staat = { voor: new Set(), soort: "", labels: new Set() };

    /* Voor wie? (alleen bij meerdere personen) */
    const alle = info.personen;
    let bewaarKnop = null;

    const controleer = () => {
        const tekst = tekstVeld.value.trim();
        if(bewaarKnop) bewaarKnop.disabled = !(staat.voor.size && staat.soort && tekst);
    };

    if(alle.length > 1){
        const v = el("div", "obsVeld");
        v.appendChild(el("span", "obsLabel", "Voor wie?"));
        const rij = el("div", "obsKeuzes");

        const knoppen = [];
        const zet = (leden, knop) => {
            staat.voor = new Set(leden);
            knoppen.forEach(k => k.b.classList.toggle("aan", k.b === knop));
            controleer();
        };

        alle.forEach(p => {
            const b = el("button", "obsKeuze", persoonTekst(p));
            b.type = "button";
            b.onclick = () => zet([p.sleutel], b);
            knoppen.push({ b: b });
            rij.appendChild(b);
        });

        const samen = el("button", "obsKeuze", alle.length === 2 ? "Beide" : "Allemaal");
        samen.type = "button";
        samen.onclick = () => zet(alle.map(p => p.sleutel), samen);
        knoppen.push({ b: samen });
        rij.appendChild(samen);

        v.appendChild(rij);
        c.appendChild(v);
    }else{
        staat.voor = new Set([alle[0].sleutel]);
        const v = el("div", "obsVeld");
        v.appendChild(el("span", "obsLabel", "Voor"));
        v.appendChild(el("div", "", persoonTekst(alle[0])));
        c.appendChild(v);
    }

    /* Soort */
    const vs = el("div", "obsVeld");
    vs.appendChild(el("span", "obsLabel", "Soort"));
    const rs = el("div", "obsKeuzes");
    const soortKnoppen = [];
    SOORTEN.forEach(s => {
        const b = el("button", "obsKeuze s-" + s, s);
        b.type = "button";
        b.onclick = () => {
            staat.soort = s;
            soortKnoppen.forEach(x => x.classList.toggle("aan", x === b));
            controleer();
        };
        soortKnoppen.push(b);
        rs.appendChild(b);
    });
    vs.appendChild(rs);
    c.appendChild(vs);

    /* Labels */
    const vl = el("div", "obsVeld");
    vl.appendChild(el("span", "obsLabel", "Labels (optioneel)"));
    const rl = el("div", "obsKeuzes");
    LABELS.forEach(l => {
        const b = el("button", "obsKeuze klein", l);
        b.type = "button";
        b.onclick = () => {
            if(staat.labels.has(l)) staat.labels.delete(l); else staat.labels.add(l);
            b.classList.toggle("aan", staat.labels.has(l));
        };
        rl.appendChild(b);
    });
    vl.appendChild(rl);
    c.appendChild(vl);

    /* Incident */
    const vi = el("div", "obsVeld");
    vi.appendChild(el("span", "obsLabel", "Incident (optioneel)"));
    const sel = el("select");
    sel.appendChild(new Option("Geen incident", ""));
    const openInc = (typeof incidentData !== "undefined" && incidentData && Array.isArray(incidentData.lijst))
        ? incidentData.lijst.filter(i => i.status === "open").sort((a, b) => a.nr - b.nr) : [];
    openInc.forEach(i => {
        sel.appendChild(new Option("#" + i.nr + " " + (i.omschrijving || ""), i.id));
    });
    if(unit.incidentId && openInc.some(i => i.id === unit.incidentId)) sel.value = unit.incidentId;
    vi.appendChild(sel);
    c.appendChild(vi);

    /* Tekst */
    const vt = el("div", "obsVeld");
    vt.appendChild(el("span", "obsLabel", "Observatie"));
    const tekstVeld = el("textarea");
    tekstVeld.maxLength = 600;
    tekstVeld.addEventListener("input", controleer);
    tekstVeld.addEventListener("keydown", (e) => {
        if(e.key === "Enter" && (e.ctrlKey || e.metaKey) && bewaarKnop && !bewaarKnop.disabled) bewaarKnop.click();
    });
    vt.appendChild(tekstVeld);
    c.appendChild(vt);

    const knoppen = el("div", "obsKnoppen");
    const annuleer = el("button", "", "Annuleren");
    annuleer.type = "button";
    annuleer.onclick = () => sluit("obsForm");
    bewaarKnop = el("button", "btnPrimary", "Opslaan");
    bewaarKnop.type = "button";
    bewaarKnop.disabled = true;
    bewaarKnop.onclick = () => {

        const gekozen = alle.filter(p => staat.voor.has(p.sleutel));
        const nu = Date.now();
        const groep = "g" + nu.toString(36) + Math.random().toString(36).slice(2, 6);
        const inc = openInc.find(i => i.id === sel.value) || null;

        gekozen.forEach(p => {
            const anderen = gekozen.filter(x => x.sleutel !== p.sleutel).map(x => x.naam || x.callsign);
            obs.push({
                id: "o" + nu.toString(36) + Math.random().toString(36).slice(2, 7),
                groep: groep,
                t: nu,
                unit: info.sleutel,
                sleutel: p.sleutel,
                callsign: p.callsign,
                naam: p.naam,
                reeks: p.reeks,
                soort: staat.soort,
                labels: LABELS.filter(l => staat.labels.has(l)),
                incNr: inc ? inc.nr : null,
                tekst: tekstVeld.value.trim().replace(/\s*\n+\s*/g, " "),
                samen: anderen
            });
        });

        bewaar(K_OBS, obs);
        sluit("obsForm");
        herteken();
    };
    knoppen.append(annuleer, bewaarKnop);
    c.appendChild(knoppen);

    toon("obsForm");
    setTimeout(() => tekstVeld.focus(), 30);
}

/* ---- Kladnotities einde dienst --------------------------------------------- */
function handtekening(lijst){
    return JSON.stringify(lijst.map(o => [o.id, o.t, o.soort, o.labels, o.incNr, o.tekst, o.samen]));
}

function perPersoon(){
    const kaart = new Map();
    obs.forEach(o => {
        if(!kaart.has(o.sleutel)){
            kaart.set(o.sleutel, { sleutel: o.sleutel, callsign: o.callsign, naam: o.naam, reeks: o.reeks, lijst: [] });
        }
        kaart.get(o.sleutel).lijst.push(o);
    });
    const uit = Array.from(kaart.values());
    uit.forEach(p => p.lijst.sort((a, b) => a.t - b.t));
    uit.sort((a, b) => (Number(nummerVan(a.callsign)) || 0) - (Number(nummerVan(b.callsign)) || 0) || a.naam.localeCompare(b.naam, "nl"));
    return uit;
}

function regelTekst(o){
    const delen = [uurTekst(o.t) + " [" + o.soort + "]"];
    if(o.incNr) delen.push("(inc. " + o.incNr + ")");
    const labels = (o.labels || []).join(", ");
    let tekst = (labels ? labels + ": " : "") + o.tekst;
    if(o.samen && o.samen.length) tekst += " (samen met " + o.samen.join(", ") + ")";
    return "- " + delen.join(" ") + " " + tekst;
}

function persoonBlok(p){
    return persoonTekst(p) + "\n" +
        "Observatie:\n" +
        p.lijst.map(regelTekst).join("\n");
}

function alleTekst(){
    return "Notities TO – niet het definitieve verslag\n\n" + perPersoon().map(persoonBlok).join("\n\n");
}

function kopieer(tekst){
    try{
        if(navigator.clipboard && navigator.clipboard.writeText){
            return navigator.clipboard.writeText(tekst).then(() => true, () => val(tekst));
        }
    }catch(e){}
    return Promise.resolve(val(tekst));

    function val(t){
        try{
            const ta = document.createElement("textarea");
            ta.value = t;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return ok;
        }catch(e){ return false; }
    }
}

function nietGekopieerd(){
    return perPersoon().filter(p => kopie[p.sleutel] !== handtekening(p.lijst));
}

function openOverzicht(){
    maakModal("obsKlad", true);
    tekenKlad();
    toon("obsKlad");
}

function tekenKlad(){

    const c = inhoud("obsKlad");
    const personen = perPersoon();

    const kop = el("div", "modalHead");
    kop.appendChild(el("h3", "", "Kladnotities einde dienst"));
    kop.appendChild(el("p", "obsSub", "Leidraad voor je definitieve observatieverslag. Dit zijn alleen notities."));
    c.appendChild(kop);

    const boven = el("div", "obsBoven");

    const alleSig = handtekening(obs.slice().sort((a, b) => a.t - b.t));
    const alles = el("button", "btnPrimary", "Kopieer alles");
    alles.type = "button";
    alles.disabled = !personen.length;
    if(personen.length && kopie["*alles"] === alleSig) alles.appendChild(el("span", "obsHaak", "✓"));
    alles.onclick = () => {
        kopieer(alleTekst()).then(ok => {
            if(!ok){ showInfo("Kopiëren mislukt", "Kopiëren lukt niet. Probeer het per persoon."); return; }
            personen.forEach(p => { kopie[p.sleutel] = handtekening(p.lijst); });
            kopie["*alles"] = alleSig;
            bewaar(K_KOPIE, kopie);
            tekenKlad();
        });
    };
    boven.appendChild(alles);

    c.appendChild(boven);

    const st = el("div", "obsPersStatus");
    c.appendChild(st);
    zetPersStatus();

    if(!personen.length){
        c.appendChild(el("div", "obsLeegKlad", "Nog geen observaties genoteerd."));
    }

    personen.forEach(p => {

        const kaart = el("div", "obsPersoon");

        const kopRij = el("div", "obsPersoonKop");
        const naam = el("div", "obsPersoonNaam", persoonTekst(p));
        kopRij.appendChild(naam);

        const sig = handtekening(p.lijst);
        const kop2 = el("button", "obsKopieer", "Kopieer");
        kop2.type = "button";
        if(kopie[p.sleutel] === sig) kop2.appendChild(el("span", "obsHaak", "✓"));
        kop2.onclick = () => {
            kopieer(persoonBlok(p)).then(ok => {
                if(!ok){ showInfo("Kopiëren mislukt", "Kopiëren lukt niet."); return; }
                kopie[p.sleutel] = handtekening(p.lijst);
                bewaar(K_KOPIE, kopie);
                tekenKlad();
            });
        };
        kopRij.appendChild(kop2);
        kaart.appendChild(kopRij);

        const tel = (s) => p.lijst.filter(o => o.soort === s).length;
        kaart.appendChild(el("div", "obsTelling", tel("Positief") + " positief · " + tel("Werkpunt") + " werkpunt · " + tel("Neutraal") + " neutraal"));

        p.lijst.forEach(o => {
            const rij = el("div", "obsRij");
            rij.appendChild(el("span", "obsTijd", uurTekst(o.t)));
            rij.appendChild(el("span", "obsSoort " + o.soort, o.soort));

            const t = el("div", "obsTekst");
            const meta = [];
            if(o.incNr) meta.push("inc. " + o.incNr);
            if(o.unit) meta.push(o.unit);
            if(meta.length) t.appendChild(el("span", "obsMeta", "(" + meta.join(" · ") + ") "));
            const labels = (o.labels || []).join(", ");
            t.appendChild(document.createTextNode((labels ? labels + ": " : "") + o.tekst + (o.samen && o.samen.length ? " (samen met " + o.samen.join(", ") + ")" : "")));
            rij.appendChild(t);

            const wis = el("button", "obsWis", "✕");
            wis.type = "button";
            wis.title = "Deze observatie verwijderen";
            wis.onclick = () => {
                obs = obs.filter(x => x.id !== o.id);
                bewaar(K_OBS, obs);
                tekenKlad();
                herteken();
            };
            rij.appendChild(wis);
            kaart.appendChild(rij);
        });

        c.appendChild(kaart);
    });

    const knoppen = el("div", "obsKnoppen");
    const dicht = el("button", "btnPrimary", "Sluiten");
    dicht.type = "button";
    dicht.onclick = () => sluit("obsKlad");
    knoppen.appendChild(dicht);
    c.appendChild(knoppen);
}

/* ---- Knop in de kop (alleen TO-MINICAD) --------------------------------------- */
function werkKnopBij(){
    const b = document.getElementById("obsKladBtn");
    if(!b) return;
    const open_ = nietGekopieerd().length;
    b.classList.toggle("metStip", open_ > 0);
    b.title = "Kladnotities einde dienst" + (obs.length ? " (" + obs.length + ")" : "") +
        (open_ ? " – er zijn nog niet-gekopieerde notities" : "");
    b.setAttribute("aria-label", "Kladnotities einde dienst");
}

function bouwMenu(){

    if(document.getElementById("obsKladBtn")) return;

    const midden = document.querySelector(".headMidden");
    if(!midden) return;

    const klad = el("button", "undoBtn alleenTO", "");
    klad.id = "obsKladBtn";
    klad.type = "button";
    klad.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3v18"/><path d="M10 8h6"/><path d="M10 12h6"/><path d="M10 16h4"/></svg><span class="obsStip" aria-hidden="true"></span>';
    klad.onclick = openOverzicht;
    midden.insertBefore(klad, midden.firstChild);

    werkKnopBij();
}

/* ---- Nieuwe sessie ------------------------------------------------------------- */
function voorNieuweSessie(){

    const open_ = nietGekopieerd();
    if(!open_.length) return Promise.resolve(true);

    const aantal = open_.reduce((n, p) => n + p.lijst.length, 0);

    return openDialog(
        "Niet-gekopieerde observaties",
        aantal + " observatie" + (aantal === 1 ? "" : "s") + " (bij " + open_.length + " persoon" + (open_.length === 1 ? "" : "en") +
        ") " + (aantal === 1 ? "is" : "zijn") + " nog niet gekopieerd. Bij een nieuwe sessie " + (aantal === 1 ? "wordt" : "worden") + " " + (aantal === 1 ? "die" : "ze") + " gewist, samen met de gekozen meerijders.",
        false, "", true, false, { ok: "Toch wissen", nee: "Annuleren" }
    ).then(r => r === true);
}

function wis(){
    obs = [];
    meer = {};
    kopie = {};
    bewaar(K_OBS, obs);
    bewaar(K_MEER, meer);
    bewaar(K_KOPIE, kopie);
    sluit("obsKlad");
    herteken();
}

/* ---- Publiek -------------------------------------------------------------------- */
window.Observaties = {
    tegel: tegel,
    radioUpdate: radioUpdate,
    aantal: () => obs.length,
    voorNieuweSessie: voorNieuweSessie,
    wis: wis,
    openOverzicht: openOverzicht,
    wisselOverzicht: () => { if(open("obsKlad")) sluit("obsKlad"); else openOverzicht(); },
    vernieuwPersoneel: () => laadPersoneel(true),
    /* Voor tests */
    _tekst: alleTekst
};

bouwMenu();
herteken();
laadPersoneel(false);

})();
