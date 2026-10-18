// BelgiëPD v0.9.6.2 – dienstgebonden dossiercontrole vóór de migratie.
// Geen schrijfacties. Elk twijfelgeval blijft afzonderlijk terugvindbaar.
import {createHash} from 'node:crypto';
import {normalizePersonnel,activityIndex} from './normalize.js';
import {dossierLinksFromGrid} from './dossier-links.js';

export const PERSONNEL_SOURCES=Object.freeze({
  politie:{range:'POLITIE!A3:R',nameCol:3,idCol:17},
  brandweer:{range:'BRANDWEER!A3:N',nameCol:3,idCol:13},
  ambulance:{range:'AMBULANCE!A3:K',nameCol:3,idCol:10},
  depannage:{range:'DEPANNAGE!A3:H',nameCol:3,idCol:7},
  burger:{range:'BURGERS!A3:G',nameCol:3,idCol:6}
});
export const AUXILIARY_SOURCES=Object.freeze({brandweerInfo:'BrandweerInfo!A1:M'});
export const ACTIVITY_RANGE='ACTIVITEITSCHECK!A2:Z';
const clean=value=>String(value??'').trim();
const goodId=value=>/^\d{15,22}$/.test(clean(value));
const hasData=row=>Array.isArray(row)&&row.some(c=>clean(c)!=='');
const safeCellRow=row=>(Array.isArray(row)?row:[]).map(cell=>typeof cell==='string'?cell:String(cell??''));
const normName=s=>clean(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('nl');
export const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const orderedRecords=records=>[...records].sort((a,b)=>a.key.localeCompare(b.key,'en'));

// Eén Discord-ID = één persoon, maar kan meerdere afzonderlijke dienstendossiers hebben.
// Alleen herhalingen binnen dezelfde dienst worden door de parser als mogelijke dubbels gemeld.
export function summarizeMemberships(records,duplicates=[]){
  const departmentsByPerson=new Map();
  for(const record of records){
    const personId=record?.personnel?.personId;
    const dept=record?.personnel?.dept;
    if(!goodId(personId)||!dept)continue;
    if(!departmentsByPerson.has(personId))departmentsByPerson.set(personId,new Set());
    departmentsByPerson.get(personId).add(dept);
  }
  const multiDepartmentPeople=[...departmentsByPerson.values()].filter(depts=>depts.size>1);
  return Object.freeze({
    uniquePeople:departmentsByPerson.size,
    multipleServices:multiDepartmentPeople.length,
    serviceMemberships:[...departmentsByPerson.values()].reduce((n,depts)=>n+depts.size,0),
    maxServicesPerPerson:Math.max(0,...[...departmentsByPerson.values()].map(depts=>depts.size)),
    duplicateRowsWithinService:duplicates.length,
    burgerStageConflicts:duplicates.filter(d=>d.department==='burger'&&d.reason==='burger_statusconflict').length
  });
}

function prepareBrandweerInfo(rows){
  const entries=[],byName=new Map();
  if(!Array.isArray(rows)||!rows.length)throw new Error('BrandweerInfo ontbreekt: zonder deze bron mogen brandweerdossiers niet gekoppeld worden.');
  // A1:M: kolom A naam, L Discord-ID, M eerdere naam/alias; rij 1 is de kop.
  for(let i=1;i<rows.length;i++){
    const sourceCells=safeCellRow(rows[i]);if(!hasData(sourceCells))continue;
    const sourceRow=i+1,id=clean(sourceCells[11]);
    const entry={sourceRow,sourceCells,discordId:goodId(id)?id:null,aliases:[sourceCells[0],sourceCells[12]].map(normName).filter(Boolean),used:false};
    entries.push(entry);
    if(!entry.discordId)continue;
    for(const name of new Set(entry.aliases)){
      if(!byName.has(name))byName.set(name,[]);
      byName.get(name).push(entry);
    }
  }
  return {entries,byName};
}

function determineBurgerStages(rows){
  const stages=[];
  let stage='onbekend';
  for(let i=0;i<rows.length;i++){
    const label=normName(rows[i]?.[1]);
    if(label==='burger in opleiding'||label==='bio')stage='in_opleiding';
    else if(label==='burger')stage='volwaardig';
    stages.push(stage);
  }
  return stages;
}
function burgerPerson(row,id,stage){
  const name=clean(row[3]),status=clean(row[4])||'Onbekend';
  const specializations=[{label:'Burgerraad',value:clean(row[5])||'Niet ingevuld'}];
  return {id:`burger:${id}`,personId:id,name,call:clean(row[0])||'—',dept:'burger',rank:clean(row[2])||'—',
    series:stage==='in_opleiding'?'Burger in opleiding':stage==='volwaardig'?'Burger':'Onbekend',
    seriesRaw:stage,status,trainingStage:stage,specialties:specializations,
    special:clean(row[5])==='Ja'?'Burgerraad: Ja':'Geen geregistreerde specialisaties',
    hours:null,totalHours:null,last:null,lastConnection:null,lastCheck:null,activityStatus:null,
    lastPing:null,pingCount:null,pingResponses:null};
}

// extra.brandweerInfo bevat de live celwaarden van BrandweerInfo!A1:M.
// Bij twee overeenkomende kandidaten kiezen we NIET op basis van overeenkomst/positie.
export function planPersonnelMigration(personnel,activityRows,legacyGrid=null,extra={}){
  const records=[],unmatched=[],activity=[],activityUnmatched=[],sourceAuxiliary=[];
  const headings={},statistics={},duplicates=[];
  const activityMap=activityIndex(activityRows||[]);
  const bwInfo=prepareBrandweerInfo(extra?.brandweerInfo);
  for(const [dept,spec] of Object.entries(PERSONNEL_SOURCES)){
    const rows=personnel?.[dept];
    if(!Array.isArray(rows)||!rows.length)throw new Error(`Bronblad ${dept} ontbreekt of is leeg. Migratie afgebroken.`);
    headings[dept]=safeCellRow(rows[0]);
    const byId=new Map(),normalizedRows=[rows[0]],stages=dept==='burger'?determineBurgerStages(rows):[];
    let ignored=0;
    for(let i=1;i<rows.length;i++){
      const row=safeCellRow(rows[i]);
      if(!hasData(row)){ignored++;normalizedRows.push(row);continue;}
      const sourceRow=i+3,name=clean(row[spec.nameCol]);
      let id=clean(row[spec.idCol]);
      let brandweerInfoRow=null;
      if(dept==='brandweer'&&name){
        const candidates=bwInfo.byName.get(normName(name))||[];
        const distinct=new Set(candidates.map(c=>c.discordId));
        if(distinct.size>1){
          unmatched.push({key:`${dept}_${sourceRow}`,dept,sourceRow,sourceCells:row,reason:'meerdere_brandweerinfo_kandidaten'});
          normalizedRows.push(row);continue;
        }
        if(distinct.size===1){
          const candidate=candidates[0];
          if(goodId(id)&&id!==candidate.discordId){
            unmatched.push({key:`${dept}_${sourceRow}`,dept,sourceRow,sourceCells:row,reason:'tegenstrijdige_discord_ids'});
            normalizedRows.push(row);continue;
          }
          id=candidate.discordId;
          brandweerInfoRow=candidate.sourceRow;
          // Markeer alle bronrijen die exact dezelfde ID en naamvariant bevestigen.
          for(const c of candidates)if(c.discordId===id)c.used=true;
          row[spec.idCol]=id; // uitsluitend in geheugen, nooit het originele Sheet wijzigen
        }
      }
      const item={key:`${dept}_${sourceRow}`,dept,sourceRow,sourceCells:safeCellRow(rows[i]),
        ...(brandweerInfoRow?{brandweerInfoRow}:{})};
      if(!goodId(id)||!name){
        unmatched.push({...item,reason:!goodId(id)?'discord_id_ontbreekt_of_ongeldig':'naam_ontbreekt'});
        normalizedRows.push(row);continue;
      }
      if(byId.has(id)){
        const first=byId.get(id);
        const differentStages=dept==='burger'&&first.trainingStage!==stages[i];
        duplicates.push({department:dept,discordId:id,sourceRows:[first.sourceRow,sourceRow],
          ...(differentStages?{reason:'burger_statusconflict'}:{})});
        if(differentStages)first.trainingStage='te_controleren';
        unmatched.push({...item,reason:differentStages?'burger_statusconflict':'dubbele_discord_id'});
        normalizedRows.push(row);continue;
      }
      byId.set(id,{...item,trainingStage:dept==='burger'?stages[i]:null});
      normalizedRows.push(row);
    }
    if(dept==='burger'){
      for(const [id,origin] of byId){
        const raw=safeCellRow(rows[origin.sourceRow-3]);
        records.push({key:`burger_${id}`,personnel:burgerPerson(raw,id,origin.trainingStage),
          sourceRow:origin.sourceRow,sourceCells:origin.sourceCells});
      }
    }else{
      const normalized=normalizePersonnel(dept,normalizedRows,activityMap);
      for(const value of normalized){
        const origin=byId.get(value.personId);
        if(!origin)throw new Error(`Inconsistent normalisatieresultaat voor ${dept}`);
        records.push({key:`${dept}_${value.personId}`,personnel:value,
          sourceRow:origin.sourceRow,sourceCells:origin.sourceCells,
          ...(origin.brandweerInfoRow?{brandweerInfoRow:origin.brandweerInfoRow}:{})});
      }
    }
    statistics[dept]={records:records.filter(x=>x.personnel.dept===dept).length,
      unmatched:unmatched.filter(x=>x.dept===dept).length,duplicates:duplicates.filter(x=>x.department===dept).length,
      emptyRows:ignored};
  }
  // BrandweerInfo bevat soms leden die niet (meer) op de BRW-hoofdlijst staan.
  // Behoud elke relevante bronrij, óók wanneer deze niet gekoppeld kon worden.
  for(const entry of bwInfo.entries){
    sourceAuxiliary.push({key:`brandweerinfo_${entry.sourceRow}`,dept:'brandweerinfo',
      sourceRow:entry.sourceRow,sourceCells:entry.sourceCells,discordId:entry.discordId,
      matched:entry.used});
    if(!entry.used){
      unmatched.push({key:`brandweerinfo_${entry.sourceRow}`,dept:'brandweerinfo',sourceRow:entry.sourceRow,
        sourceCells:entry.sourceCells,
        reason:entry.discordId?'niet_gekoppeld_aan_brandweer':'discord_id_ontbreekt_of_ongeldig'});
    }
  }
  statistics.brandweerinfo={records:bwInfo.entries.filter(x=>x.used).length,
    unmatched:unmatched.filter(x=>x.dept==='brandweerinfo').length,
    duplicates:0,emptyRows:0};
  const activitySeen=new Map();
  for(let i=1;i<(activityRows||[]).length;i++){
    const cells=safeCellRow(activityRows[i]);if(!hasData(cells))continue;
    const id=clean(cells[4]),sourceRow=i+2;
    if(!goodId(id)){
      activityUnmatched.push({key:`activity_${sourceRow}`,sourceRow,sourceCells:cells,reason:'discord_id_ontbreekt_of_ongeldig'});
      continue;
    }
    if(activitySeen.has(id)){
      activityUnmatched.push({key:`activity_${sourceRow}`,sourceRow,sourceCells:cells,reason:'dubbele_discord_id'});
      continue;
    }
    activitySeen.set(id,sourceRow);
    activity.push({key:id,sourceRow,sourceCells:cells,normalized:activityMap.get(id)||null});
  }
  const links=dossierLinksFromGrid(legacyGrid);
  const legacyLinks=[...links.links.entries()].map(([discordId,url])=>({key:discordId,
    discordId,url:url||null,ambiguous:links.ambiguous.has(discordId)}));
  const sorted=orderedRecords(records);
  const fingerprint=checksum({
    personnel:sorted.map(r=>[r.key,r.sourceCells,r.personnel.trainingStage||null,r.brandweerInfoRow||null]),
    unmatched:unmatched.map(r=>[r.key,r.reason,r.sourceCells]),
    sourceAuxiliary:sourceAuxiliary.map(r=>[r.key,r.sourceCells]),
    activity:activity.map(r=>[r.key,r.sourceCells]),
    activityUnmatched:activityUnmatched.map(r=>[r.key,r.sourceCells]),
    legacyLinks:legacyLinks.sort((a,b)=>a.key.localeCompare(b.key,'en'))
  });
  return {records:sorted,unmatched,duplicates,activity,activityUnmatched,legacyLinks,sourceAuxiliary,headings,statistics,fingerprint,
    membershipSummary:summarizeMemberships(sorted,duplicates),
    totals:{records:records.length,unmatched:unmatched.length,duplicates:duplicates.length,
      activity:activity.length,activityUnmatched:activityUnmatched.length,legacyLinks:legacyLinks.length,
      sourceAuxiliary:sourceAuxiliary.length,
      ambiguousLinks:legacyLinks.filter(r=>r.ambiguous).length}};
}

export function migrationDocuments(plan){
  return [
    ...plan.records.map(x=>({kind:'personnel',key:x.key,data:{...x.personnel,sourceRow:x.sourceRow,sourceCells:x.sourceCells,
      ...(x.brandweerInfoRow?{brandweerInfoRow:x.brandweerInfoRow}:{})}})),
    ...plan.unmatched.map(x=>({kind:'unmatched',key:x.key,data:x})),
    ...plan.sourceAuxiliary.map(x=>({kind:'source_auxiliary',key:x.key,data:x})),
    ...plan.activity.map(x=>({kind:'activity',key:x.key,data:x})),
    ...plan.activityUnmatched.map(x=>({kind:'activity_unmatched',key:x.key,data:x})),
    ...plan.legacyLinks.map(x=>({kind:'legacy_links',key:x.key,data:x}))
  ];
}
