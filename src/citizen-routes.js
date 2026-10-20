import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {bearerToken} from './personnel-link.js';
import {citizenDossiersEnabled,verifiedCitizenId,citizenKey,
  citizenInitialData,publicCitizenProfile,CITIZEN_COLLECTION} from './citizen-policy.js';
const respond=(res,code,message)=>res.status(code).json({error:message});
const fail=(code,message)=>Object.assign(new Error(message),{publicStatus:code});
async function currentCitizen(req){
  if(process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN!=='true')
    throw fail(503,'Discord-aanmelding is nog niet geactiveerd');
  const token=bearerToken(req.get('Authorization'));
  if(!token)throw fail(401,'Aanmelding met Discord is vereist');
  let decoded;
  try{decoded=await getAuth().verifyIdToken(token)}
  catch{throw fail(401,'Discord-aanmelding is verlopen of ongeldig')}
  const id=String(decoded.uid||'').replace(/^discord:/,'');
  if(!/^\d{15,22}$/.test(id))throw fail(403,'Een Discord-identiteit is verplicht');
  const member=(await getFirestore().collection('bpd_discord_auth').doc(id).get()).data();
  if(verifiedCitizenId(decoded,member,process.env.DISCORD_GUILD_ID)!==id)
    throw fail(403,'Vernieuw je Discord-aanmelding om je identiteit te bevestigen');
  return {discordId:id,username:String(member.username||'Discord-lid').slice(0,80)};
}
function handleError(res,e){
  if(e?.publicStatus)return respond(res,e.publicStatus,e.message);
  console.error('Burgerdossier:',e?.code||e?.message||'serverfout');
  return respond(res,503,'Burgerdossier tijdelijk niet beschikbaar');
}
export function installCitizenRoutes(app){
  app.get('/api/citizens/status',(_req,res)=>{
    res.json({enabled:citizenDossiersEnabled(process.env),
      discordLoginRequired:true});
  });
  app.get('/api/citizens/me',async(req,res)=>{
    if(!citizenDossiersEnabled(process.env))
      return respond(res,503,'Burgerdossiers zijn nog niet geactiveerd');
    try{
      const citizen=await currentCitizen(req),db=getFirestore();
      const citizenDoc=db.collection(CITIZEN_COLLECTION).doc(citizenKey(citizen.discordId));
      const document=await citizenDoc.get();
      const profile=publicCitizenProfile(document.data(),citizen.discordId);
      res.json({identity:citizen,registered:Boolean(profile),profile});
    }catch(e){return handleError(res,e)}
  });
  // Citizen registration is opt-in and derives ALL identity data from fresh
  // Discord OAuth. No arbitrary subject ID or client supplied metadata accepted.
  app.post('/api/citizens/me/register',async(req,res)=>{
    if(!citizenDossiersEnabled(process.env))
      return respond(res,503,'Burgerdossiers zijn nog niet geactiveerd');
    if(req.body!==undefined&&(typeof req.body!=='object'||
      Array.isArray(req.body)||Object.keys(req.body).length))
      return respond(res,400,'Burgerdossierregistratie heeft geen invulvelden');
    try{
      const citizen=await currentCitizen(req),db=getFirestore();
      const ref=db.collection(CITIZEN_COLLECTION).doc(citizen.discordId);
      const created=await db.runTransaction(async tx=>{
        const previous=await tx.get(ref);
        if(!previous.exists){
          tx.create(ref,{...citizenInitialData(citizen.discordId,'discord_oauth',citizen.username),
            createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
          tx.create(ref.collection('audit').doc(),{
            action:'citizen_registered',origin:'discord_oauth',
            byDiscordId:citizen.discordId,at:FieldValue.serverTimestamp()
          });
          return true;
        }else if(previous.get('discordId')!==citizen.discordId||
          previous.get('category')!=='burger'||
          previous.get('state')!=='registered')
          throw fail(409,'Bestaand burgerdossier vereist administratieve controle');
        else if(previous.get('displayName')!==citizen.username)
          tx.update(ref,{displayName:citizen.username,
            updatedAt:FieldValue.serverTimestamp()});
        return false;
      });
      return res.json({registered:true,created,rightsGranted:false});
    }catch(e){return handleError(res,e)}
  });
}
