// Small, dependency-free validation utilities. All role grants require both a
// manually approved user and an independently verified Discord guild role.
export const isDiscordId = value => /^\d{15,22}$/.test(String(value ?? ''));
export const RANK = Object.freeze({basiskader:1,middenkader:2,officierenkader:3,korpsleiding:4});
const EXPECTED_ROLES = Object.keys(RANK);
export function discordConfig(env) {
  const clientId = String(env.DISCORD_CLIENT_ID || '');
  const secret = String(env.DISCORD_CLIENT_SECRET || '');
  const guildId = String(env.DISCORD_GUILD_ID || '');
  const redirect = String(env.DISCORD_REDIRECT_URI || '');
  let validRedirect = false;
  try {
    const u = new URL(redirect);
    validRedirect = u.pathname === '/auth/discord/callback' && !u.search && !u.hash &&
      (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost'));
  } catch {}
  return {clientId,secret,guildId,redirect,
    ready:isDiscordId(clientId)&&isDiscordId(guildId)&&validRedirect&&secret.length>=12&&!/^(JOUW_|YOUR_|PLACEHOLDER|CHANGE_ME)/i.test(secret)};
}
export function parseRoleMap(value) {
  if (!value || value.trim()==='') return null;
  try {
    const map=JSON.parse(value);
    if (!map || typeof map!=='object' || Array.isArray(map) || Object.keys(map).some(k=>!EXPECTED_ROLES.includes(k))) return null;
    for(const [k,ids] of Object.entries(map)) {
      if (!Array.isArray(ids) || !ids.length || ids.some(id=>!isDiscordId(id))) return null;
    }
    return map;
  } catch {return null;}
}
// Only allow the *existing* approved access if the current guild-role mapping
// independently demonstrates the same rank or higher. No new access by default.
export function discordAccess(entry,member,map,expectedGuild,now=Date.now()) {
  if (!entry || !EXPECTED_ROLES.includes(entry.role) || !Array.isArray(entry.departments)) return false;
  if (!map || !member || member.guildId!==expectedGuild) return false;
  if (!Number.isSafeInteger(member.verifiedAt) || Math.abs(now-member.verifiedAt)>15*60*1000) return false;
  if (!Array.isArray(member.roleIds) || member.roleIds.some(id=>!isDiscordId(id))) return false;
  const roles=new Set(member.roleIds);
  return EXPECTED_ROLES.some(level=>RANK[level]>=RANK[entry.role] && map[level]?.some(id=>roles.has(id)));
}
export function validReturnTo(route){return ['/','/registraties.html','/weekrapporten.html','/roepnummers.html','/discord-status.html','/verlofbeheer.html','/rollen-opleidingen.html','/gebruikersbeheer.html','/personeelsbeheer.html','/personeel-koppelen.html','/solliciteren.html','/sollicitatiebeheer.html','/dossiercentrum.html'].includes(route)?route:'/discord-status.html';}
