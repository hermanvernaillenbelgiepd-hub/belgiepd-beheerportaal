import { google } from 'googleapis';
import {planPoliceSheetSync, policeSheetUpdates} from './callsign-utils.js';
const RANGE=['POLITIE!A1:R253','PolitieInfo!A1:Q658'];
export async function getPolicePlan(personnelSpreadsheetId,request,options={}) {
  const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const sheets=google.sheets({version:'v4',auth});
  const results=await sheets.spreadsheets.values.batchGet({spreadsheetId:personnelSpreadsheetId,ranges:RANGE,valueRenderOption:'FORMATTED_VALUE'});
  const [policeRows,infoRows]=(results.data.valueRanges||[]).map(x=>x.values||[]);
  if(policeRows.length<200 || infoRows.length<10)throw new Error('Personeelslijst lijkt onvolledig; synchronisatie gestopt');
  return planPoliceSheetSync({policeRows,infoRows,name:request.name,discordId:request.discordId,preferredCall:options.preferredCall});
}
export async function performPoliceSync(personnelSpreadsheetId,plan) {
  // Een vlak vóór de schrijfoperatie uitgevoerde hercontrole. Google Sheets biedt geen cross-service transactie.
  const fresh=await getPolicePlan(personnelSpreadsheetId,plan,{preferredCall:plan.call});
  if(fresh.policeRow!==plan.policeRow||fresh.infoRow!==plan.infoRow||
     fresh.temporaryPoliceRow!==plan.temporaryPoliceRow)
    throw new Error('Google Sheet is tussentijds gewijzigd; synchronisatie geannuleerd');
  const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets']});
  const sheets=google.sheets({version:'v4',auth});
  const body={valueInputOption:'RAW',data:policeSheetUpdates(plan).filter(u=>!u.range.startsWith('PolitieInfo!O'))};
  // Formule schrijven we apart met USER_ENTERED, uitsluitend wanneer eerste schrijfstap voltooid is.
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:personnelSpreadsheetId,requestBody:body});
  await sheets.spreadsheets.values.update({spreadsheetId:personnelSpreadsheetId,range:`PolitieInfo!O${plan.infoRow}`,valueInputOption:'USER_ENTERED',requestBody:{values:policeSheetUpdates(plan).find(u=>u.range.startsWith('PolitieInfo!O')).values}});
  // Verifieer resultaat expliciet; nooit succes claimen zonder actuele broncontrole.
  let verified=false;
  for (let attempt=0;attempt<4;attempt++) {
    if(attempt) await new Promise(resolve=>setTimeout(resolve,attempt*750));
    const verify=await sheets.spreadsheets.values.batchGet({spreadsheetId:personnelSpreadsheetId,ranges:[`POLITIE!D${plan.policeRow}`,`POLITIE!R${plan.policeRow}`,`PolitieInfo!A${plan.infoRow}`,`PolitieInfo!P${plan.infoRow}`],valueRenderOption:'FORMATTED_VALUE'});
    const [name,linkedId,infoName,infoId]=(verify.data.valueRanges||[]).map(x=>String(x.values?.[0]?.[0]??''));
    let oldSlotCleared=true;
    if(Number.isInteger(plan.temporaryPoliceRow)){
      const legacy=await sheets.spreadsheets.values.get({
        spreadsheetId:personnelSpreadsheetId,
        range:`POLITIE!D${plan.temporaryPoliceRow}`,
        valueRenderOption:'FORMATTED_VALUE'
      });
      oldSlotCleared=String(legacy.data.values?.[0]?.[0]??'')==='';
    }
    if(name===plan.name&&infoName===plan.name&&infoId===plan.discordId&&
       linkedId===plan.discordId&&oldSlotCleared){verified=true;break;}
  }
  if(!verified)throw new Error('Bronbestand nog niet volledig bijgewerkt; handmatige controle nodig');
  return {call:plan.call,discordId:plan.discordId,policeRow:plan.policeRow,infoRow:plan.infoRow,internalLink:plan.internalLink};
}
