// UI-only compact dossier records. Receives already-authorized API data;
// never fetches additional dossiers, modifies registration content or rights.
const str=(v,max=5000)=>typeof v==='string'?v.slice(0,max):'';
export function dossierPreviewText(value,limit=112){
  const plain=String(value??'').replace(/\s+/g,' ').trim();
  if(plain.length<=limit)return plain||'Geen omschrijving';
  return plain.slice(0,Math.max(20,limit-1)).trimEnd()+'…';
}
export function dossierAuthorFacts(row={}){
  const raw=row?.registeredBy||row?.author||row?.submittedByActor||null;
  const who=raw&&typeof raw==='object'?raw:{};
  const name=str(who.name||row?.registeredByName||row?.byNameAtCreation||
    (typeof raw==='string'?raw:'')||row?._noteAuthor||row?.authorName||'',130);
  const call=str(who.call||row?.registeredCall||row?.byCallAtCreation||'',32);
  const rank=str(who.rank||row?.registeredRank||row?.byRankAtCreation||'',120);
  const id=str(who.discordId||row?.byDiscordId||'',26);
  const imported=row?.historicalImport===true;
  const importer=imported&&row?.submittedByActor?.name?
    str(row.submittedByActor.name,120):row?.historicalImport&&row?.importedBy?.name?
      str(row.importedBy.name,120):'';
  const date=str(row?.eventDate||row?._noteSortDate||'',25);
  const time=str(row?.eventTime||'',8);
  const savedAt=str(row?.createdAt||row?.recordedAt||'',48);
  return {name:name||id||'Niet geregistreerd',rank,call,id,date,time,savedAt,
    imported,importer,importReason:str(row?.onBehalfReason||'',320)};
}
export function dossierAuthorLine(row={}){
  const x=dossierAuthorFacts(row);
  return (x.imported?'Oorspronkelijke invoerder: ':'Door ')+x.name+
    (x.rank?' · '+x.rank:'')+(x.call?' · '+x.call:'');
}
function field(content,label,value){
 if(!value)return;
 const row=document.createElement('div');row.className='bpd-record-fact';
 const title=document.createElement('dt');title.textContent=label;
 const text=document.createElement('dd');text.textContent=String(value);
 row.append(title,text);content.append(row);
}
export function attachDossierRecordPreview(item,{
 row={},text='',bodyNode=null,metaNode=null,authorText='',title='Registratie',
 extra=[]
}={}){
 if(!item||typeof item.append!=='function')return item;
 const facts=dossierAuthorFacts(row),complete=String(text??'').slice(0,10000)||'—';
 item.classList.add('bpd-dossier-compact');
 if(bodyNode)bodyNode.textContent=dossierPreviewText(complete);
 if(metaNode)metaNode.textContent=authorText||dossierAuthorLine(row);
 const details=document.createElement('details');
 details.className='bpd-dossier-inspector';
 const summary=document.createElement('summary');
 summary.textContent='ⓘ Volledige info';
 summary.setAttribute('aria-label','Toon volledige gegevens van '+String(title).slice(0,140));
 const content=document.createElement('div');content.className='bpd-dossier-inspector-content';
 const heading=document.createElement('strong');heading.className='bpd-dossier-inspector-title';
 heading.textContent=String(title).slice(0,250);
 const description=document.createElement('p');
 description.className='bpd-dossier-full-text';description.textContent=complete;
 const fields=document.createElement('dl');fields.className='bpd-dossier-facts';
 field(fields,facts.imported?'Oorspronkelijke invoerder':'Ingevuld door',facts.name);
 field(fields,'Graad bij registratie',facts.rank);
 field(fields,'Roepnummer bij registratie',facts.call);
 field(fields,'Datum gebeurtenis',facts.date+(facts.time?' '+facts.time:''));
 field(fields,'Geregistreerd op',facts.savedAt);
 if(facts.imported)field(fields,'Overgenomen door',facts.importer);
 if(facts.imported)field(fields,'Bron / overname',facts.importReason);
 for(const pair of extra||[]){
   if(Array.isArray(pair)&&pair.length===2)field(fields,pair[0],pair[1]);
 }
 content.append(heading,description,fields);
 details.append(summary,content);
 item.append(details);
 return item;
}
