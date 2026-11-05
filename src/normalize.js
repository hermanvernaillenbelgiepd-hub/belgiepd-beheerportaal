// Schone, beperkte gegevens voor de webapp; nooit de hele ruwe Sheets-tabellen teruggeven.
// Indexen gebaseerd op live Google Sheets-headers, gecontroleerd op 16 oktober 2026.
const specs = {
  politie: { name: 3, callsign: 0, rank: 2, series: 4, status: 5, discord: 17,
    specialties: [[6,'Radio BM'],[7,'SIV/WPR'],[8,'Signalisatie'],[9,'Motor'],[10,'Semi-ano.'],[11,'K9'],[12,'RAGO'],[13,'Dispatch'],[14,'TO'],[15,'AE']] },
  ambulance: { name: 3, callsign: 0, rank: 2, series: 1, status: 4, discord: 10,
    specialties: [[5,'Basis TR'],[6,'Medicatie'],[7,'HELI'],[9,'MIP']] },
  brandweer: { name: 3, callsign: 0, rank: 2, series: 1, status: 4, discord: 13,
    specialties: [[5,'Basis TR'],[6,'Logistiek'],[7,'Ladderwagen'],[8,'Duiker'],[9,'Signalisatie'],[10,'RED team'],[11,'Gevaarlijke stoffen'],[12,'Grote Boot']] },
  depannage: { name: 3, callsign: 0, rank: 2, series: 1, status: 4, discord: 7,
    specialties: [[5,'Opleiding DEP2K'],[6,'Opleiding FAST']] }
};
// Exact, validated specialties taken from the currently connected
// per-service Google Sheets columns: no invented SRT/DSU qualifications.
export const SPECIALTY_LABELS=Object.freeze(Object.fromEntries(
  Object.entries(specs).map(([dept,spec])=>[dept,
    Object.freeze([...spec.specialties.map(([,label])=>label),
      ...(dept==='ambulance'?[
        // Native AZLS qualification from verified Discord PITMOTO role.
        // Not a new spreadsheet column or a personnel rank.
        'PIT-MOTOR'
      ]:dept==='brandweer'?[
        // RED team and Basis TR already exist as actual Google Sheets fields.
        // Do not add display-alias fields RED-TEAM / Basistraining twice.
        'Logistiek / Signalisatie','Bosbestrijding','Brandweer-AMBU'
      ]:dept==='depannage'?[
        // No Google Sheets source columns for these two capabilities yet.
        // Both default to "Niet ingevuld" until an authorized audited update.
        'CRANE','WEGENWERKEN'
      ]:[])])])
));
const s = value => String(value ?? '').trim();
const integer = value => { const str=s(value).replace(',','.'); return /^(0|[1-9]\d*)(\.\d+)?$/.test(str) ? Number(str) : null; };
const discordId = value => /^\d{15,22}$/.test(s(value)) ? s(value) : null;
const isQualified = value => { const v=s(value).toLocaleLowerCase('nl'); return v && !['nee','n.v.t.','nvt','-'].includes(v); };
const normStatus = value => s(value) || 'Onbekend';
// In de politiesheet is 'KADER' een verzamelcode, geen officiële kaderindeling.
// Alleen die code wordt naar de juiste benaming omgezet op basis van de rang.
// De ingevulde reeksen (1, 2, 3 ...) blijven altijd behouden.
// Roepnummers 100-199 zijn tijdelijk; 200-299 zijn vaste agenten.
// 008 is een aparte beheersroepnaam en wordt nooit automatisch Bestuur.
function policeCallNumber(raw){
  const matched=s(raw).match(/^(?:[a-z]+[- ]?)?(\d{3})$/i);
  return matched?Number(matched[1]):null;
}
export function policeKader(rank,call='') {
  const n=policeCallNumber(call);
  if(n!==null && n>=100 && n<=299)return 'Agentenkader';
  if(n!==null && n>=900 && n<=999)return 'Officierenkader / Korpsleiding';
  const r=s(rank).toLocaleLowerCase('nl');
  if (/hoofdcommissaris|eerste\s+commissaris|\b1hcp\b|\b1cp\b/i.test(r)) return 'Korpsleiding';
  if (/aspirant\s+commissaris|\bacp\b/i.test(r)) return 'Officierenkader';
  if (/commissaris|\bcp\b/i.test(r)) return 'Korpsleiding';
  if (/hoofdinspecteur|\(ahinp\)|\(hinp\)|\(1hinp\)/i.test(r)) return 'Middenkader';
  if(/inspecteur|\(ainp\)|\(1inp\)|\(inp\)/i.test(r))return 'Basiskader';
  if(n!==null && n>=300 && n<=999)return 'Basiskader';
  if(/agent|\(ap\)|\(aap\)|\(1ap\)/i.test(r))return 'Basiskader';
  return 'Kader'; // Geen aanname bij een onbekende rang.
}
export function displaySeries(value, rank = '', dept = 'politie', call = '') {
  const raw=s(value);
  if (!raw) return 'Niet ingevuld';
  if (/^kader(?:\b|[^a-z])/i.test(raw)) return dept === 'politie' ? policeKader(rank,call) : 'Kader';
  if (/^leiding\b/i.test(raw)) return 'Leiding';
  if (/^\d+$/.test(raw)) return `Reeks ${raw}`;
  return raw;
}


export function activityIndex(rows) {
  // ACTIVITEITSCHECK!A2:Z300: eerste rij is een kopregel, E=Discord ID, S=periodeverschil, T=totaal.
  const map = new Map();
  for (const row of rows.slice(1)) {
    const id=discordId(row[4]);
    if (!id) continue;
    map.set(id, {
      last: integer(row[8]),
      hours: integer(row[18]),
      totalHours: integer(row[19]),
      lastConnection: s(row[6]) || null,
      lastCheck: s(row[7]) || null,
      activityStatus: normStatus(row[14]),
      lastPing: s(row[9]) || null,
      pingCount: integer(row[12]),
      pingResponses: integer(row[13])
    });
  }
  return map;
}

export function normalizePersonnel(dept, rows, activities = new Map()) {
  const spec=specs[dept];
  if (!spec) throw new Error('Onbekende dienst');
  const result=[];
  const seen=new Set();
  // Tabbladen zijn inclusief kopregels vanaf rij 3; categorierijen zonder geldige ID worden genegeerd.
  for (const row of rows.slice(1)) {
    const id=discordId(row[spec.discord]);
    const name=s(row[spec.name]);
    if (!id || !name) continue;
    // Dezelfde persoon kan voorkomen in verschillende hulpdiensten; per dienst slechts één fiche.
    if (seen.has(id)) continue;
    seen.add(id);
    // De bron ACTIVITEITSCHECK beschrijft politieactiviteit; koppel deze niet automatisch aan andere diensten.
    const a=dept==='politie'?activities.get(id):undefined;
    // Status van IEDERE specialisatie bewaren: expliciet 'Nee' is iets anders dan leeg.
    // Oude 'special' string behouden voor compatibiliteit met versie 0.2.
    const specialties=spec.specialties.map(([col,label])=>({
      label,value:s(row[col]) || 'Niet ingevuld'
    }));
    const specialText=specialties.filter(x=>isQualified(x.value)).map(x=>`${x.label}: ${x.value}`).join(' · ');

    result.push({
      id:`${dept}:${id}`, personId:id, name, call:s(row[spec.callsign]) || '—',
      dept, rank:s(row[spec.rank]) || '—',
      series:displaySeries(row[spec.series], row[spec.rank], dept, row[spec.callsign]), seriesRaw:s(row[spec.series]) || null,
      kader:dept==='politie'?policeKader(row[spec.rank],row[spec.callsign]):null,
      status:normStatus(row[spec.status]), specialties,
      special:specialText || 'Geen geregistreerde specialisaties',
      hours:a?.hours ?? null, totalHours:a?.totalHours ?? null,
      last:a?.last ?? null, lastConnection:a?.lastConnection ?? null,
      lastCheck:a?.lastCheck ?? null, activityStatus:a?.activityStatus ?? null,
      lastPing:a?.lastPing ?? null,
      pingCount:a?.pingCount ?? null, pingResponses:a?.pingResponses ?? null
    });
  }
  return result;
}

export function buildData(personnelRanges,activityRows,allowedDepartments) {
  const activities=activityIndex(activityRows);
  return Object.keys(specs)
    .filter(dept=>allowedDepartments.includes(dept))
    .flatMap(dept=>normalizePersonnel(dept,personnelRanges[dept]||[],activities));
}
