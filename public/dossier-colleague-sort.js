// De keuzelijst 'Andere collega selecteren' in een geopend dossier.
// Hergebruik exact de dienstspecifieke personeelslijstsorteermodi.
// Deze lijst verandert geen dossiers of toegangsrechten.
export const DOSSIER_COLLEAGUE_DEPARTMENTS=Object.freeze([
 'politie','brandweer','ambulance','depannage','burger'
]);
export const DOSSIER_COLLEAGUE_SORT_MODES=Object.freeze({
 politie:'series-desc',brandweer:'brandweer',
 ambulance:'ambulance',depannage:'depannage',burger:'name-asc'
});
export function sortDossierColleagues(people,comparePersonnel,department=null){
 if(typeof comparePersonnel!=='function')throw new TypeError('Vergelijkingsfunctie ontbreekt');
 if(department!==null&&!DOSSIER_COLLEAGUE_DEPARTMENTS.includes(department))return [];
 const order=new Map(DOSSIER_COLLEAGUE_DEPARTMENTS.map((dept,i)=>[dept,i]));
 const entries=Array.isArray(people)?people.filter(person=>
  person&&person.canOpenDossier===true&&
  (department===null||person.dept===department)):[];
 return [...entries].sort((a,b)=>{
  const left=order.get(a.dept)??99,right=order.get(b.dept)??99;
  if(left!==right)return left-right;
  if(left===99&&a.dept!==b.dept)
   return String(a.dept||'').localeCompare(String(b.dept||''),'nl-BE');
  return comparePersonnel(a,b,DOSSIER_COLLEAGUE_SORT_MODES[a.dept]||'name-asc');
 });
}
