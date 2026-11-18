// Zelfstandige OOXML-export: geen extra npm-pakketten of externe diensten.
// Alleen aanroepen nadat de server het rapport en de dossierrechten heeft gecontroleerd.
import {deflateRawSync} from 'node:zlib';

const text=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const xml=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const limit=(v,n=6000)=>text(v).slice(0,n);
const PARA=(s,opts={})=>{
  const {bold=false,heading=false,shade=false}=opts;
  const runs=limit(s).split(/\r?\n/).map((line,i)=>`${i?'<w:br/>':''}<w:t xml:space="preserve">${xml(line)}</w:t>`).join('');
  const ppr=heading?'<w:pPr><w:spacing w:before="250" w:after="100"/><w:keepNext/><w:pStyle w:val="Heading2"/></w:pPr>':'<w:pPr><w:spacing w:after="70"/></w:pPr>';
  const rpr=bold?'<w:rPr><w:b/></w:rPr>':'';
  return `<w:p>${ppr}<w:r>${rpr}${runs||'<w:t> </w:t>'}</w:r></w:p>`;
};
const CELL=(value,header=false,width=2900)=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header?'<w:shd w:fill="DFE8F7"/>':''}<w:tcBorders><w:bottom w:val="single" w:sz="4" w:color="D4DEEB"/></w:tcBorders></w:tcPr>${PARA(value,{bold:header})}</w:tc>`;
const TABLE=(headers,rows)=>{
  const widths=[1350,1250,2900,2500,7300];
  const borders='<w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="D4DEEB"/></w:tblBorders>';
  const row=(values,header=false)=>`<w:tr>${header?'<w:trPr><w:tblHeader w:val="true"/></w:trPr>':''}${values.map((x,i)=>CELL(x,header,widths[i])).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="15300" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map(x=>`<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${row(headers,true)}${rows.map(r=>row(r)).join('')}</w:tbl>`;
};
export const deptName=dept=>({politie:'Politie',brandweer:'Brandweer',ambulance:'Ambulance',depannage:'Depannage'})[dept]||'Onbekend';
export function specialFields(e){
  const p=[];
  if(e.sanctionType)p.push('Sanctie: '+limit(e.sanctionType,120));
  if(Array.isArray(e.reasons)&&e.reasons.length)p.push('Redenen: '+e.reasons.map(x=>limit(x,100)).join(', '));
  if(e.severity!==undefined&&e.severity!==null)p.push('Ernst: '+String(e.severity)+'/10');
  if(e.type==='observatie'&&Number.isInteger(e.score))
    p.push('Observatiescore: '+e.score+'/10');
  if(e.status&&e.type==='sanctie')p.push('Status: '+limit(e.status,70));
  if(e.sanctionType==='Tijdelijke beperking'&&Array.isArray(e.restrictedSpecialties)&&
     e.restrictedSpecialties.length)
    p.push('Beperkte specialisaties: '+e.restrictedSpecialties.map(x=>limit(x,90)).join(', '));
  if(e.sanctionType==='Tijdelijke beperking'&&e.endDate)
    p.push('Tijdelijke beperking tot en met: '+e.endDate);
  else if(e.endDate)p.push('Einddatum: '+e.endDate);
  if(e.courseName)p.push('Opleiding: '+limit(e.courseName,150));
  if(e.newName)p.push('Nieuwe naam: '+limit(e.newName,150));
  if(e.proposedRank)p.push('Voorgestelde graad: '+limit(e.proposedRank,150));
  if(e.movement)p.push('Personeelsbeweging: '+limit(e.movement,150));
  if(e.type==='functiewijziging'){
    if(e.previousFunction)p.push('Vorige functie: '+limit(e.previousFunction,120));
    if(e.newFunction)p.push('Nieuwe functie: '+limit(e.newFunction,120));
    if(e.reason)p.push('Motivering functiewijziging: '+limit(e.reason,500));
  }
  if(e.referenceUrl||e.evidenceUrl)p.push('Bijlage: '+limit(e.referenceUrl||e.evidenceUrl,800));
  if(e.otherPlayers)p.push('Andere betrokkenen: '+limit(e.otherPlayers,1000));
  if(e.historicalImport===true){
    p.push('Historische overname uit spreadsheet');
    if(e.onBehalfOf?.name||e.registeredBy?.name)
      p.push((e.type==='observatie'?'Oorspronkelijke observator: ':
        'Oorspronkelijke registrator: ')+limit(e.onBehalfOf?.name||e.registeredBy.name,120));
    if(e.submittedByActor?.name)
      p.push('Handmatig ingevoerd door: '+limit(e.submittedByActor.name,120));
    if(e.onBehalfReason)p.push('Bron/motivering: '+limit(e.onBehalfReason,500));
  }
  return p;
}
export function entryDescription(e){
  const parts=[...specialFields(e)];
  const body=limit(e.details||e.explanation||'',4000);
  if(body)parts.push(body);
  return parts.join('\n')||'Geen omschrijving';
}
export function reportSummary(out){
  return {
    title:out.report.title,
    period:`${out.report.periodStart} t/m ${out.report.periodEnd}`,
    dept:deptName(out.report.dept),
    count:out.recordCount,
    excluded:out.excludedTestCount||0,
    sections:(out.sections||[]).map(section=>({type:section.type,label:section.label,count:section.entries.length}))
  };
}
function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}
  return (c^0xffffffff)>>>0;
}
function zip(entries){
  const files=[],central=[];let offset=0;
  for(const [name,data] of Object.entries(entries)){
    const fname=Buffer.from(name,'utf8'),raw=Buffer.from(data,'utf8'),packed=deflateRawSync(raw),crc=crc32(raw),header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0,6);header.writeUInt16LE(8,8);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(fname.length,26);
    files.push(header,fname,packed);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(8,10);
    dir.writeUInt32LE(crc,16);dir.writeUInt32LE(packed.length,20);dir.writeUInt32LE(raw.length,24);dir.writeUInt16LE(fname.length,28);dir.writeUInt32LE(offset,42);
    central.push(dir,fname);offset+=header.length+fname.length+packed.length;
  }
  const centralData=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);
  end.writeUInt32LE(centralData.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...files,centralData,end]);
}
export function createWeekReportDocx(out){
  if(!out?.report||!Array.isArray(out.sections)||out.truncated)throw new Error('Onvolledig of ongeldig weekrapport kan niet geëxporteerd worden');
  const r=out.report,body=[];
  body.push(PARA('BELGIËPD BEHEERPORTAAL',{bold:true}));
  body.push(PARA(r.title,{heading:true}));
  body.push(PARA('Hulpdienst: '+deptName(r.dept)));
  body.push(PARA('Rapportperiode: '+r.periodStart+' t/m '+r.periodEnd));
  body.push(PARA('Aangemaakt door: '+(r.createdBy?.name||'Onbekend')));
  body.push(PARA('Status: CONCEPT – dynamische weergave, geen afgesloten archief',{bold:true}));
  body.push(PARA('Registraties: '+out.recordCount+' · Uitgesloten testregistraties: '+(out.excludedTestCount||0)));
  body.push(PARA('Belangrijk: alleen actuele Firestore-dossierregistraties. Oude Word-rapporten en externe Google-dossiers zijn niet geïmporteerd.'));
  for(const section of out.sections){
    body.push(PARA(section.label+' ('+section.entries.length+')',{heading:true}));
    const rows=section.entries.map(e=>[
      e.eventDate||'',
      e.subjectCallAtCreation||'',
      e.subjectNameAtCreation||'',
      e.registeredBy?.name||'Onbekend',
      entryDescription(e)
    ]);
    if(rows.length)body.push(TABLE(['Datum','Roepnr.','Personeelslid','Geregistreerd door','Omschrijving / details'],rows));
    else body.push(PARA('Geen registraties binnen deze periode.'));
  }
  body.push(PARA('Dit document is een export van een dynamisch concept. Wijzigingen in de dossierdatabase kunnen latere exports beïnvloeden.'));
  const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="750" w:right="750" w:bottom="750" w:left="750" w:header="350" w:footer="350" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const entries={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="20477A"/><w:sz w:val="25"/></w:rPr></w:style></w:styles>',
    'word/document.xml':document
  };
  return zip(entries);
}
