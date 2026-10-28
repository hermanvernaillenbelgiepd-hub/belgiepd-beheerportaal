// Display-only middle-cadre order. No ranks, memberships or access rights.
export const MID_ORDER_COLLECTION='bpd_organogram_mid_order_audit';
const ID=/^\d{15,22}$/;
export function callMiddleSeries(value){
 const match=String(value||'').trim().match(/(?:^|[- ])(\d{3})(?:\b|$)/);
 if(!match)return null;
 const n=Number(match[1]);
 return n>=600&&n<900?String(Math.floor(n/100)*100):null;
}
export function validMidOrder(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['series','personIds','reason'].includes(k)))
  throw Error('Ongeldige sorteeraanvraag');
 const {series,personIds}=body;
 if(!['600','700','800'].includes(series))throw Error('Kies een middenkaderreeks');
 if(!Array.isArray(personIds)||personIds.length<2||personIds.length>100||
  personIds.some(id=>!ID.test(id))||new Set(personIds).size!==personIds.length)
  throw Error('Ledenlijst ongeldig of onvolledig');
 const reason=String(body.reason||'').trim();
 if(reason.length<8||reason.length>300)
  throw Error('Motivering van 8 tot 300 tekens verplicht');
 return {series,personIds:[...personIds],reason};
}
