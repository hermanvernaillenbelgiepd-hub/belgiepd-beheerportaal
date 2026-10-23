// TEST-only voorbereiding: geen database- of spreadsheetmutaties.
const CATEGORIES = new Map([
  ['observatie','observaties'],['sanctie','sancties'],
  ['opleiding','opleidingen'],['notitie','administratieve_notities'],
  ['verlof','verlof'],['personeelsbeweging','personeelsbewegingen']
]);
const clean = value => typeof value === 'string' ? value.trim() : '';
const validId = id => /^\d{15,22}$/.test(clean(id));
const validDept = dept => ['politie','brandweer','ambulance','depannage'].includes(dept);
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
const keyFor = row => [clean(row.dept),clean(row.discordId)].join('_');

/**
 * Bouw uitsluitend een controleerbaar importplan. Originele records blijven in
 * hun bronmodule staan. Geen impliciete persoonsmatches via naam/roepnummer.
 * sourceId is een stabiele primaire sleutel uit de bron, geen rij-index.
 */
export function planDossierImport(records, roster) {
  if (!Array.isArray(records) || !Array.isArray(roster))
    throw new TypeError('Records en personeelslijst moeten arrays zijn');
  const rosterCounts = new Map();
  for (const person of roster) {
    if (!validDept(person?.dept) || !validId(person?.personId)) continue;
    const key = [person.dept,person.personId].join('_');
    rosterCounts.set(key,(rosterCounts.get(key)||0)+1);
  }
  const accepted=[],review=[],seen=new Set();
  for (const [index,row] of records.entries()) {
    const source=clean(row?.source),sourceId=clean(row?.sourceId);
    const dept=clean(row?.dept),discordId=clean(row?.discordId);
    const category=CATEGORIES.get(clean(row?.type));
    const sourceKey=source && sourceId ? source+':'+sourceId : null;
    const reason=!sourceKey?'ontbrekende_bronidentiteit'
      :!validDept(dept)||!validId(discordId)?'ongeldige_personeelsidentiteit'
      :!category?'onbekende_categorie'
      :!iso(row?.eventDate)?'ontbrekende_of_ongeldige_datum'
      :rosterCounts.get(keyFor(row))!==1?'geen_uniek_personeelsdossier'
      :seen.has(sourceKey)?'dubbele_bronregistratie':null;
    if (reason) {review.push({index,source,sourceId,dept,discordId,reason});continue;}
    seen.add(sourceKey);
    accepted.push({
      source,sourceId,dept,discordId,category,eventDate:row.eventDate,
      // Alleen referenties; gegevens blijven beheerd en bewerkt in hun bronmodule.
      destinationKey:keyFor(row),mode:'reference_only'
    });
  }
  return {readOnly:true,accepted,review,totals:{input:records.length,accepted:accepted.length,review:review.length}};
}
