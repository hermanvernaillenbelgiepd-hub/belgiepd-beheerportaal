// Read-only startup probe for the BelgiumPD member/role API.
// This API token is separate from the official Discord bot credential.
// Never return/log credentials, member IDs, names, role IDs, or API payloads.
export const BPD_DISCORD_USERS_URL='https://beta.belgiepd.be/api/v1/discord/users';
const ID=/^\d{15,22}$/;
const MAX_BYTES=12*1024*1024;
const MAX_MEMBERS=30000;
const possibleRows=data=>Array.isArray(data)?data:
 Array.isArray(data?.users)?data.users:
 Array.isArray(data?.members)?data.members:
 Array.isArray(data?.results)?data.results:
 Array.isArray(data?.data)?data.data:
 Array.isArray(data?.data?.users)?data.data.users:
 Array.isArray(data?.data?.members)?data.data.members:null;
function verifiedShape(payload){
 const records=possibleRows(payload);
 if(!records||records.length>MAX_MEMBERS)return null;
 if(records.length===0)return {users:0,roles:0};
 // Validate all member/role IDs as strings. JS numbers truncate Discord IDs.
 let roles=0;
 for(const member of records){
  if(!member||typeof member!=='object'||Array.isArray(member)||
     (typeof member.discord_id!=='string'||!ID.test(member.discord_id))||!Array.isArray(member.roles)||
     member.roles.length>500)return null;
  for(const role of member.roles){
   if(!role||typeof role!=='object'||Array.isArray(role)||
      (typeof role.id!=='string'||!ID.test(role.id)))return null;
  }
  roles+=member.roles.length;
 }
 return {users:records.length,roles};
}
async function readLimited(response){
 const len=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(len)&&len>MAX_BYTES)return null;
 if(!response.body?.getReader){
  const content=await response.text();
  return Buffer.byteLength(content,'utf8')<=MAX_BYTES?content:null;
 }
 const reader=response.body.getReader();
 const chunks=[];let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>MAX_BYTES){await reader.cancel();return null;}
   chunks.push(Buffer.from(value));
  }
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
export async function probeBelgiumPdDiscordUsers({
 env=process.env,fetchImpl=fetch
}={}){
 const token=String(env.BPD_DISCORD_USERS_API_TOKEN||'').trim();
 if(!token||token.length<8||/^(YOUR_|JOUW_|PLACEHOLDER|CHANGE_ME)/i.test(token))
  return {status:'not_configured'};
 try{
  const response=await fetchImpl(BPD_DISCORD_USERS_URL,{
   method:'GET',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   signal:AbortSignal.timeout(11000),redirect:'error',
   cache:'no-store'
  });
  if(response.status===401)return {status:'unauthorized'};
  if(response.status===403)return {status:'forbidden'};
  if(response.status===404)return {status:'not_found'};
  if(response.status===429)return {status:'rate_limited'};
  if(!response.ok)return {status:'api_unavailable'};
  const content=await readLimited(response);
  if(content===null)return {status:'response_too_large'};
  let payload;
  try{payload=JSON.parse(content)}catch{return {status:'invalid_json'};}
  const counts=verifiedShape(payload);
  if(!counts)return {status:'unexpected_schema'};
  return {status:'ok',memberCount:counts.users,roleCount:counts.roles};
 }catch{return {status:'connection_failed'};}
}
