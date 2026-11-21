// A formal VLINDER supports all three police series, but remains ONE staff member.
// Never infer VLINDER from a 700 callsign or a person's name.
export function policeWorkflowSeriesTargets(person,parseSeries){
 const vlinder=[person?.series,person?.reekshoofdReeks].some(value=>
  /^vlinders?$/i.test(String(value??'').trim()));
 if(vlinder)return [1,2,3];
 const series=parseSeries(person?.series)??parseSeries(person?.reekshoofdReeks);
 return series===null?[]:[series];
}
