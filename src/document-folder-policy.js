// Logical folders group documents inside Firestore; they never alter the
// immutable Storage object paths or department access boundaries.
export const BUILTIN_DOCUMENT_FOLDERS=Object.freeze({
  politie:Object.freeze([
    {id:'builtin-motard',name:'Motard'},
    {id:'builtin-dispatch',name:'Dispatch'},
    {id:'builtin-k9',name:'K-9'}
  ])
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeFolderId(value){
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||!(/^(builtin-(motard|dispatch|k9))$/.test(value)||UUID.test(value)))
    throw Object.assign(Error('Ongeldige mapselectie'),{status:400});
  return value;
}
export function builtInFolders(department){
  return [...(BUILTIN_DOCUMENT_FOLDERS[department]||[])].map(x=>({...x,system:true}));
}
// Deterministic tombstone for removable built-in folders; separate from
// custom UUID folder IDs and never treated as a public folder ID.
export function systemFolderArchiveKey(department,folderId){
 if(!builtInFolders(department).some(folder=>folder.id===folderId))
   throw Object.assign(Error('Onbekende standaardmap'),{status:400});
 return 'archived_system_folder__'+department+'__'+folderId;
}
export function resolveDocumentUrl(value){
  if(typeof value!=='string'||value.length>1800)
    throw Object.assign(Error('Geef een geldige HTTPS-link op'),{status:400});
  let url;
  try{url=new URL(value);}catch{throw Object.assign(Error('Ongeldige URL'),{status:400});}
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    !url.hostname.includes('.')||url.hostname==='localhost'||
    /(^|\.)localhost$|(^|\.)local$|(^|\.)internal$/.test(url.hostname)||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)||
    url.hostname.includes(':'))
    throw Object.assign(Error('Alleen publieke HTTPS-links zijn toegestaan'),{status:400});
  return url.href;
}
export function safeYouTubeEmbed(value){
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    const host=u.hostname.toLowerCase();
    let id=null;
    if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
      if(u.pathname==='/watch')id=u.searchParams.get('v');
      else if(/^\/(embed|shorts)\/[a-zA-Z0-9_-]{11}$/.test(u.pathname))
        id=u.pathname.split('/')[2];
    }else if(host==='youtu.be')id=u.pathname.slice(1);
    if(!/^[a-zA-Z0-9_-]{11}$/.test(id||''))return null;
    return 'https://www.youtube-nocookie.com/embed/'+id+'?rel=0';
  }catch{return null;}
}
