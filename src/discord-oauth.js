import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { discordConfig, isDiscordId, validReturnTo } from './discord-utils.js';
import {discordBotToken,botRefreshAllowed,botRefreshTooSoon,verifiedBotMember} from './discord-bot-refresh.js';

const B = bytes => Buffer.from(bytes).toString('base64url');
const b64 = n => B(randomBytes(n));
const timingEqual=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const getCookie=(req,key)=>{const val=(req.headers.cookie||'').split('; ').find(x=>x.startsWith(key+'='));return val?.slice(key.length+1)||''};
function appAuth(){if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});return getAuth()}
function signed(value,key){return `${value}.${createHmac('sha256',key).update(value).digest('base64url')}`}
function unsigned(value,key){const p=value.lastIndexOf('.');if(p<0)return null;const data=value.slice(0,p);if(!timingEqual(value.slice(p+1),createHmac('sha256',key).update(data).digest('base64url')))return null;try{return JSON.parse(Buffer.from(data,'base64url').toString('utf8'))}catch{return null}}
async function discordJson(url,opts={}){
  const response=await fetch(url,{...opts,signal:AbortSignal.timeout(12000),
    headers:{'Accept':'application/json',...(opts.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    // Never log URLs with parameters, access tokens, Client Secrets or response
    // descriptions. Classify only the failing OAuth stage and a safe error code.
    const path=new URL(url).pathname;
    const stage=path.endsWith('/oauth2/token')?'token_exchange':
      path.endsWith('/users/@me')?'identity_lookup':
      path.includes('/guilds/')&&path.endsWith('/member')?'guild_member_lookup':'discord_api';
    const oauthCode=typeof data.error==='string'&&/^[a-z_]{3,40}$/.test(data.error)?
      data.error:'unknown';
    throw new Error('Discord '+stage+' HTTP '+response.status+' ('+oauthCode+')');
  }
  return data;
}
// One-time exchange codes: this is intentionally a single-process local test.
// A multi-instance cloud deployment must use a distributed store instead.
const handoffs=new Map();
export function installDiscordOAuth(app){
  // An ephemeral HMAC key prevents forgeable OAuth callback cookies after restarts.
  const cookieKey=randomBytes(32);
  const config=()=>discordConfig(process.env);
  app.get('/auth/discord/status',(_req,res)=>{const cfg=config();res.json({ready:cfg.ready,serverConfigured:Boolean(cfg.guildId),portalLoginEnabled:process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN==='true',testMode:false});});
  app.get('/auth/discord/start',(req,res)=>{
    const cfg=config();if(!cfg.ready)return res.status(503).send('Discord is nog niet ingesteld. Vul eerst de echte Client Secret lokaal in .env in.');
    const state=b64(24),verifier=b64(32);
    const data={state,verifier,iat:Date.now(),returnTo:validReturnTo(String(req.query.return||''))};
    const cookieName='bpd_discord_oauth';const val=signed(B(Buffer.from(JSON.stringify(data))),cookieKey);
    res.set('Set-Cookie',`${cookieName}=${val}; HttpOnly; SameSite=Lax; Path=/auth/discord/callback; Max-Age=600${cfg.redirect.startsWith('https://')?'; Secure':''}`);
    const u=new URL('https://discord.com/oauth2/authorize');
    u.searchParams.set('client_id',cfg.clientId);
    u.searchParams.set('response_type','code');
    u.searchParams.set('redirect_uri',cfg.redirect);
    u.searchParams.set('scope','identify guilds.members.read');
    u.searchParams.set('state',state);
    u.searchParams.set('code_challenge',B(createHash('sha256').update(verifier).digest()));
    u.searchParams.set('code_challenge_method','S256');
    res.redirect(302,u.toString());
  });
  app.get('/auth/discord/callback',async(req,res)=>{
    const cfg=config();
    res.set('Set-Cookie','bpd_discord_oauth=; HttpOnly; SameSite=Lax; Path=/auth/discord/callback; Max-Age=0');
    const raw=getCookie(req,'bpd_discord_oauth');
    const rawData=unsigned(raw,cookieKey);
    const state=rawData?.state;
    if(!rawData||!timingEqual(state,req.query.state||'')||Date.now()-rawData.iat>600000 || Date.now()<rawData.iat || !cfg.ready || typeof req.query.code!=='string') {
      return res.redirect(302,'/discord-status.html?error=ongeldige_of_verlopen_poging');
    }
    try {
      const params=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.secret,grant_type:'authorization_code',code:req.query.code,redirect_uri:cfg.redirect,code_verifier:rawData.verifier});
      const oauth=await discordJson('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params});
      if(typeof oauth.access_token!=='string'||!String(oauth.scope||'').includes('guilds.members.read'))throw new Error('Ontbrekende toestemmingen');
      const authorization={Authorization:'Bearer '+oauth.access_token};
      const user=await discordJson('https://discord.com/api/v10/users/@me',{headers:authorization});
      if(!isDiscordId(user.id))throw new Error('Ongeldige Discord gebruiker');
      const member=await discordJson('https://discord.com/api/v10/users/@me/guilds/'+cfg.guildId+'/member',{headers:authorization});
      if(member.user?.id && member.user.id!==user.id)throw new Error('Discord-lidmaatschap komt niet overeen');
      const roles=Array.isArray(member.roles)?member.roles.filter(isDiscordId):[];
      if(!member.joined_at || !Array.isArray(member.roles))throw new Error('Geen controleerbaar lidmaatschap');
      const now=Date.now();
      // Only limited member metadata are stored. OAuth access and refresh tokens
      // are NEVER persisted, logged or included in the browser response.
      appAuth();
      await getFirestore().collection('bpd_discord_auth').doc(user.id).set({guildId:cfg.guildId,roleIds:roles,joinedAt:String(member.joined_at),username:String(user.global_name||user.username||'').slice(0,80),verifiedAt:now,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      const token=await getAuth().createCustomToken('discord:'+user.id,{bpdDiscord:true,bpdGuildId:cfg.guildId});
      const handle=b64(32);handoffs.set(handle,{token,expires:now+60000});
      for(const [key,x] of handoffs)if(x.expires<now)handoffs.delete(key);
      const p=new URLSearchParams({bpd_discord_code:handle,returnTo:validReturnTo(rawData.returnTo)});
      res.redirect(302,'/discord-status.html?'+p.toString());
    } catch(e){console.error('Discord OAuth mislukt:',String(e.message||'fout').slice(0,130));res.redirect(302,'/discord-status.html?error=aanmelden_mislukt');}
  });
  app.post('/auth/discord/exchange',app.locals.discordJsonParser,(req,res)=>{
    const code=req.body?.code;
    if(typeof code!=='string'||!/^[A-Za-z0-9_-]{30,80}$/.test(code))return res.status(400).json({error:'Ongeldige aanmeldcode'});
    const one=handoffs.get(code);handoffs.delete(code);
    if(!one||Date.now()>one.expires)return res.status(401).json({error:'Discord-aanmelding verlopen. Probeer opnieuw.'});
    res.set('Cache-Control','no-store');res.json({customToken:one.token});
  });
  // User-initiated membership sync using server-held Discord bot credentials.
  // No OAuth refresh tokens are stored, no identities are accepted from the UI.
  // This remains usable when the old role snapshot has expired.
  const botRefreshPending=new Set();
  app.post('/api/discord/refresh',async(req,res)=>{
    const token=discordBotToken(process.env),guild=process.env.DISCORD_GUILD_ID;
    if(!token||!isDiscordId(guild))
      return res.status(503).json({error:'De Discord-bot is nog niet ingesteld op deze Render-service. Meld je opnieuw aan met Discord.'});
    const bearer=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
    if(!bearer)return res.status(401).json({error:'Discord-aanmelding vereist'});
    let id,decoded,snapshot;
    try{
      decoded=await appAuth().verifyIdToken(bearer);
      id=decoded.uid?.startsWith('discord:')?decoded.uid.slice(8):'';
      if(!isDiscordId(id))return res.status(403).json({error:'Gebruik je eigen Discord-login'});
      snapshot=await getFirestore().collection('bpd_discord_auth').doc(id).get();
      if(!botRefreshAllowed(decoded,snapshot.data(),guild))
        return res.status(403).json({error:'Discord-verificatie ontbreekt. Meld je eerst opnieuw aan met Discord.'});
    }catch{return res.status(401).json({error:'Discord-aanmelding verlopen of ongeldig'})}
    if(botRefreshPending.has(id)||botRefreshTooSoon(snapshot.data()))
      return res.status(429).json({error:'Recent vernieuwd. Probeer na één minuut opnieuw.'});
    botRefreshPending.add(id);
    try{
      const response=await fetch('https://discord.com/api/v10/guilds/'+guild+'/members/'+id,{
        headers:{Authorization:'Bot '+token,Accept:'application/json'},
        signal:AbortSignal.timeout(10000),redirect:'error'
      });
      if(response.status===404){
        // An account no longer in the guild must lose its cached fresh roles.
        await snapshot.ref.set({roleIds:[],verifiedAt:0,
          updatedAt:FieldValue.serverTimestamp()},{merge:true});
        return res.status(403).json({error:'Dit Discord-account is niet meer als serverlid gevonden.'});
      }
      if(!response.ok)return res.status(503).json({
        error:'De bot kon het serverlidmaatschap niet controleren. Controleer de botrechten en probeer later opnieuw.'
      });
      const data=await response.json();
      const member=verifiedBotMember(data,id);
      if(!member)return res.status(503).json({error:'Discord gaf geen controleerbare rolgegevens terug.'});
      const now=Date.now(),store=getFirestore(),batch=store.batch();
      batch.set(snapshot.ref,{guildId:guild,roleIds:member.roleIds,
        joinedAt:member.joinedAt,verifiedAt:now,botRefreshedAt:now,
        updatedAt:FieldValue.serverTimestamp()},{merge:true});
      batch.create(store.collection('bpd_discord_refresh_audit').doc(),{
        discordId:id,actorUid:decoded.uid,method:'manual_bot',
        at:FieldValue.serverTimestamp()
      });
      await batch.commit();
      return res.json({refreshed:true,roleCount:member.roleIds.length,
        lastVerifiedAt:now,changesToDiscord:false,permissionsGranted:false});
    }catch{
      return res.status(503).json({error:'Synchronisatie met de Discord-bot is tijdelijk niet beschikbaar.'});
    }finally{botRefreshPending.delete(id)}
  });
  app.get('/api/discord/profile',async(req,res)=>{
    const match=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
    if(!match)return res.status(401).json({error:'Aanmelding vereist'});
    try{
      const decoded=await appAuth().verifyIdToken(match[1]);
      if(decoded.firebase?.sign_in_provider!=='custom'||decoded.bpdDiscord!==true||!/^discord:\d{15,22}$/.test(decoded.uid))return res.status(403).json({error:'Discord-aanmelding vereist'});
      const data=(await getFirestore().collection('bpd_discord_auth').doc(decoded.uid.slice(8)).get()).data();
      if(!data||data.guildId!==process.env.DISCORD_GUILD_ID)return res.status(403).json({error:'Discord-lidmaatschap ontbreekt'});
      res.json({discordId:decoded.uid.slice(8),name:data.username||'',joinedAt:data.joinedAt||null,roleIds:data.roleIds||[],lastVerifiedAt:data.verifiedAt,accessNote:'Discord-rollen worden onafhankelijk geverifieerd. Alleen de expliciet ingestelde Politie-Middenkaderrol kan automatisch een beperkte portaalgoedkeuring krijgen.'});
    }catch{return res.status(401).json({error:'Verificatie mislukt'});}
  });
}
