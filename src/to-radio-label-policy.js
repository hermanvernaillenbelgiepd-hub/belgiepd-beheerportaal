import {canOperateBoard} from './to-board-policy.js';

// A portal display correction never changes Sonoran's callsign, connection
// identity, duty availability, pairing or authenticated account permissions.
export const validRadioId=id=>typeof id==='string'&&/^radio_[a-f0-9]{32}$/.test(id);
export function radioLabelInput(value){
  if(value===null||value==='')return null;
  if(typeof value!=='string')throw Error('Ongeldige radioweergavenaam');
  const label=value.trim().replace(/\s+/g,' ');
  if(label.length<2||label.length>80||/[<>\x00-\x1f\x7f]/.test(value))throw Error('Ongeldige radioweergavenaam');
  return label;
}
export const mayEditRadioLabel=actor=>canOperateBoard(actor);
// Enable only by an explicit service-level setting, with a configured
// Firestore project. Permissions are independently enforced per request.
export const radioLabelWritesEnabled=env=>typeof env.FIREBASE_PROJECT_ID==='string'&&
  env.FIREBASE_PROJECT_ID.trim().length>0&&
  env.BPD_ENABLE_TO_RADIO_LABEL_WRITES==='true';
export function enrichRadioSnapshot(snapshot,records){
  const safe=new Map((records||[])
    .filter(x=>validRadioId(x.id)&&typeof x.alias==='string'&&
      x.alias.length<=80&&x.alias.length>=2)
    .map(x=>[x.id,x.alias]));
  return {...snapshot,users:(snapshot.users||[]).map(user=>({...user,
    portalAlias:safe.get(user.id)||null}))};
}
