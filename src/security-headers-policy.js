/* Additive browser protections, deliberately compatible with the existing
   inline scripts, Firebase login and same-origin personnel iframe.
   This does not attempt to hide client-side source code or replace API auth. */
export function applyPortalSecurityHeaders(res){
 res.set('X-Content-Type-Options','nosniff');
 res.set('Referrer-Policy','no-referrer');
 res.set('Cache-Control','no-store');
 res.set('X-Frame-Options','SAMEORIGIN');
 res.set('Content-Security-Policy',"frame-ancestors 'self'; base-uri 'self'");
}
