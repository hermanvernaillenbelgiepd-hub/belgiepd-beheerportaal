// Alleen de hyperlink uitlezen; nooit inhoud van personeelsdossiers importeren.
// De P-kolom van PolitieInfo bevat de Discord ID als celwaarde.
// Een deel van die cellen is voorzien van een individuele hyperlink naar een dossier-tab.
const clean = v => String(v ?? '').trim();
const validDiscordId = id => /^\d{15,22}$/.test(clean(id));
// Legacy Google Sheets is één gedeeld dossierbestand, geen record-permissies per tabblad.
// Geef de URL uitsluitend aan expliciet toegelaten hogere rollen binnen dezelfde dienst.
// Middenkader krijgt de afgeschermde Firestore-registraties; toegang tot legacy
// dossierlinks volgt pas na vastlegging van de reeksscope en Google Drive-toegang.
export function mayOpenLegacyDossierLink(user, dept) {
  return Boolean(
    user && Array.isArray(user.departments) && user.departments.includes(dept) &&
    ['officierenkader', 'korpsleiding', 'beheerder'].includes(user.role)
  );
}

export function safeDossierUrl(raw) {
  try {
    const u = new URL(clean(raw));
    if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
    if (!/^\/spreadsheets\/d\/[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname)) return null;
    return u.href;
  } catch { return null; }
}
export function dossierLinksFromGrid(grid) {
  const result = new Map();
  const ambiguous = new Set();
  // Alleen losse celwaarden uit de P-kolom (nooit een roepnummer of spelersnaam).
  for (const block of grid?.sheets?.flatMap(s => s.data || []) || []) {
    for (const row of block.rowData || []) {
      const cell = row?.values?.[0];
      const id = clean(cell?.formattedValue);
      if (!validDiscordId(id)) continue;
      const url = safeDossierUrl(cell?.hyperlink);
      if (!result.has(id)) result.set(id, url);
      else if (result.get(id) !== url) ambiguous.add(id);
    }
  }
  // Geen automatische keuze wanneer de bron voor hetzelfde ID conflicteert.
  for (const id of ambiguous) result.set(id, null);
  return { links: result, ambiguous };
}
