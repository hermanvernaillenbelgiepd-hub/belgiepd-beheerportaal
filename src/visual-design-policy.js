// Only fixed, accessible presentation choices. Never accept raw CSS, URLs or
// arbitrary CSS variables from a Firestore document or browser request.
import {mayOpenTechnicalCenter} from './technical-center-config.js';

export const VISUAL_DESIGN_COLLECTION='bpd_portal_visual_design';
export const VISUAL_DESIGN_AUDIT='bpd_portal_visual_design_audit';
export const VISUAL_DESIGN_DOC='global';
export const VISUAL_FONTS=Object.freeze(['inter','system','arial','serif']);
export const VISUAL_ACCENTS=Object.freeze(['blue','teal','violet','amber']);
export const VISUAL_DENSITIES=Object.freeze(['compact','normal','comfortable']);
export const VISUAL_THEMES=Object.freeze(['light','dark']);
export const DEFAULT_VISUAL_DESIGN=Object.freeze({
 themeDefault:'light',accent:'blue',fontFamily:'inter',
 fontScale:100,density:'normal'
});
const KEYS=Object.keys(DEFAULT_VISUAL_DESIGN);
export function visualDesignFrom(raw){
 const result={};
 for(const key of KEYS)result[key]=raw?.[key]??DEFAULT_VISUAL_DESIGN[key];
 if(!VISUAL_THEMES.includes(result.themeDefault))result.themeDefault=DEFAULT_VISUAL_DESIGN.themeDefault;
 if(!VISUAL_ACCENTS.includes(result.accent))result.accent=DEFAULT_VISUAL_DESIGN.accent;
 if(!VISUAL_FONTS.includes(result.fontFamily))result.fontFamily=DEFAULT_VISUAL_DESIGN.fontFamily;
 if(!Number.isSafeInteger(result.fontScale)||result.fontScale<90||result.fontScale>120)
   result.fontScale=DEFAULT_VISUAL_DESIGN.fontScale;
 if(!VISUAL_DENSITIES.includes(result.density))result.density=DEFAULT_VISUAL_DESIGN.density;
 return result;
}
export function canManageVisualDesign(actor){
 // Reuse the already guarded management-centre role check; never accept a
 // generic service-leadership label or client-side role as authority.
 return mayOpenTechnicalCenter(actor);
}
export function validateVisualDesignWrite(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).length!==KEYS.length+2||
    ![...KEYS,'expectedRevision','reason'].every(k=>Object.hasOwn(raw,k)))
   throw Object.assign(Error('Ongeldige vormgevingsinstellingen'),{status:400});
 if(!VISUAL_THEMES.includes(raw.themeDefault)||
   !VISUAL_ACCENTS.includes(raw.accent)||
   !VISUAL_FONTS.includes(raw.fontFamily)||
   !VISUAL_DENSITIES.includes(raw.density)||
   !Number.isSafeInteger(raw.fontScale)||raw.fontScale<90||raw.fontScale>120)
   throw Object.assign(Error('Kies toegelaten kleuren, lettertype en tekstgrootte (90–120%)'),
     {status:400});
 if(!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)
   throw Object.assign(Error('Ongeldige revisie: laad de instellingen opnieuw'),{status:400});
 const reason=typeof raw.reason==='string'?raw.reason.trim():'';
 if(reason.length<10||reason.length>240||/[\x00-\x1f\x7f<>]/.test(reason))
   throw Object.assign(Error('Vul een motivering tussen 10 en 240 tekens in'),{status:400});
 const result={};for(const key of KEYS)result[key]=raw[key];
 return {...result,expectedRevision:raw.expectedRevision,reason};
}
export function isVisualDesignSame(a,b){
 return KEYS.every(k=>a[k]===b[k]);
}
