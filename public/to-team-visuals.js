import {serviceForCategory} from './to-categories.js';

// Distinct, stable VISUAL category markers. These are not rank symbols,
// Discord grants, radio channel numbers, or a real unit's availability.
const hints=Object.freeze({
  SANTO:['SA',221],BLAINE:['BL',25],WYCAN:['WY',166],FALCON:['FA',345],
  EAGLE:['EA',43],SIGMA:['SM',268],SIGNA:['SN',316],
  MARCAN:['MC',195],AIRCAN:['AC',190],CANINE:['K9',91],
  RAGO:['RA',284],MIKE:['MI',137],COMMAND:['CO',226],
  BRANDWEER:['BW',9],BWM:['BM',14],BWV:['BV',17],
  BAMBU:['BA',16],BWAMBU:['BU',22],'BW-AMBU':['BH',15],KORP:['KO',8],
  SERG:['SG',13],ADJ:['AD',19],LT:['LT',5],KAP:['KP',24],
  MAJ:['MJ',12],KOL:['KL',20],STAG:['ST',18],ZONE:['ZO',11],'ZONE-COMM':['ZC',10],
  PLOEG1:['B1',6],PLOEG2:['B2',13],PLOEG3:['B3',21],
  STAGE:['SE',172],DIRMED:['DM',175],HARTS:['HA',161],HVPK:['HV',153],HAMB:['HB',168],
  ARTS:['AR',178],VPK:['VP',144],AMB:['AM',165],
  AMBULANCE:['AU',165],'AMBULANCE-MOTOR':['MT',159],PIT:['PI',175],
  MUG:['MU',149],MUGHELI:['MH',185],'DIR-MED':['DM',173],
  'SIT-TEAM':['ST',164],
  LSRA:['LS',38],DEPK:['DP',44],
  'LSRA-DEPA100':['D1',38],'LSRA-DEPAK200':['D2',32],
  'LSRA-F.A.S.T.':['FT',42],'LSRA-ANWV':['AN',48]
});
const fallback=Object.freeze({politie:220,brandweer:10,ambulance:165,depannage:38,overige:214});
export function teamVisual(category){
  const label=String(category||'').trim().toUpperCase().slice(0,80);
  const service=serviceForCategory(label);
  const [code,hue]=hints[label]||[
    label.replace(/[^A-Z0-9]/g,'').slice(0,2)||'??',
    fallback[service.id]
  ];
  return {label:label||'OVERIGE',code,hue,serviceId:service.id,
    serviceLabel:service.label};
}
