/* Cache only publicly served, static code and images. Never cache HTML,
   API responses, uploaded documents, cookies, dossiers or personal data. */
export function publicStaticCacheControl(filename){
 if(typeof filename!=='string')return 'no-store';
 return /\.(?:css|js|svg|png|webp|jpe?g|gif|ico|woff2?)$/i.test(filename)?
  'private, no-cache, must-revalidate':'no-store';
}
