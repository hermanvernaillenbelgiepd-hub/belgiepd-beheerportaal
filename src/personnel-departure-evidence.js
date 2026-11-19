// Immutable, human-confirmed service departure context. No auto-archive logic.
const LABELS={politie:'Politie',brandweer:'Brandweer',ambulance:'Ambulance (AZLS)',
 depannage:'Depannage',burger:'Burger'};
const CAUSES={
 inactive_dismissal:'Collega verwijderd wegens inactiviteit',
 voluntary_discord_leave:'Collega verwijderd wegens verlaten Discord',
 service_resignation:'Collega vrijwillig uit dienst',
 management_dismissal:'Collega ontslagen door dienstleiding',
 other:'Collega uit dienst geplaatst'
};
const short=(x,n=180)=>String(x??'').replace(/[\u0000-\u001f<>]/g,' ').trim().slice(0,n);
export function departureEvidence(historic,services=[],cause,reason=''){
 const valid=Array.isArray(services)?services.filter(x=>LABELS[x?.dept]):[];
 const depts=[...new Set([historic?.dept,...valid.map(x=>x.dept)])]
   .filter(x=>LABELS[x]);
 const specs=Array.isArray(historic?.specialties)?
   historic.specialties.filter(x=>typeof x?.label==='string'&&
     !/^(?:nee|niet ingevuld|onbekend|nvt|niet toegestaan)$/i.test(
       String(x.value||'').trim())).slice(0,50)
     .map(x=>short(x.label,90)+(x.value?' ('+short(x.value,45)+')':''))
   :[];
 const pieces=[
   CAUSES[cause]||CAUSES.other,
   'Toenmalige graad: '+(short(historic?.rank,100)||'niet vermeld'),
   'Roepnummer: '+(short(historic?.call,24)||'niet vermeld'),
   'Reeks: '+(short(historic?.series,80)||'niet vermeld'),
   'Specialisaties: '+(specs.join(', ')||'geen geregistreerd'),
   'Geregistreerde diensten binnen bevoegdheid: '+
     (depts.map(x=>LABELS[x]).join(', ')||'onbekend'),
   'Motivering: '+short(reason,500)
 ];
 return {details:pieces.join(' · ').slice(0,4000),
  previousRank:short(historic?.rank,100),previousCall:short(historic?.call,24),
  previousSeries:short(historic?.series,80),specialties:specs,
  departments:depts,cause};
}
