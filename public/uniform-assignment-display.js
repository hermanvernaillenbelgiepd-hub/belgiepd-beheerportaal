// Client-side visual-only resolver. Scoped assignments never confer rank or roles.
import {getTier} from '/assets/organogram-hierarchie-model.js';
import {policeUniformGroup,ambulanceFunction,policeCallSeries} from '/uniform-profile-policy.js';
const UID=/^\d{15,22}$/;
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const nameCode=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
let rules=[],elementRules=[],coatChoices=[],compositions=[],assetUrls=new Map();
function setData(assignments,artworks,visualRules=[],uniformGradeChoices=[],savedCompositions=[]){
 rules=(Array.isArray(assignments)?assignments:[]).filter(x=>
  x&&['politie','brandweer','ambulance','depannage','burger'].includes(x.department)&&
  ['service','cadre','rank','person','group','function'].includes(x.scope)&&
  (CODE.test(x.selector||'')||UID.test(x.selector||'')));
 elementRules=(Array.isArray(visualRules)?visualRules:[]).filter(x=>
  x&&['politie','brandweer','ambulance','depannage','burger'].includes(x.department)&&
  ['rank','helmet','profession','logo','pictogram','patch'].includes(x.kind)&&
  ['service','cadre','rank','person','call','function'].includes(x.scope)&&
  CODE.test(x.assetCode||''));
 coatChoices=(Array.isArray(uniformGradeChoices)?uniformGradeChoices:[]).filter(x=>
  x&&['politie','brandweer','ambulance','depannage','burger'].includes(x.department)&&
  ['rank','helmet','profession'].includes(x.kind)&&CODE.test(x.uniformCode||'')&&
  CODE.test(x.assetCode||'')&&CODE.test(x.selector||''));
 compositions=(Array.isArray(savedCompositions)?savedCompositions:[]).filter(x=>
  x&&['politie','brandweer','ambulance','depannage','burger'].includes(x.department)&&
  x.assets&&x.layers&&
  ['call','rank','function'].includes(x.scope));
 assetUrls=new Map();
 for(const row of Array.isArray(artworks)?artworks:[]){
  const key=String(row?.key||''),url=String(row?.imageUrl||'');
  if(!/^(?:uniform|rank|helmet|profession|logo|pictogram|patch|specialty)_(?:politie|brandweer|ambulance|depannage|burger)_[a-z0-9][a-z0-9_]{0,39}$/.test(key)||
   !/^\/api\/role-artwork\/file\/(?:uniform|rank|helmet|profession|logo|pictogram|patch|specialty)_(?:politie|brandweer|ambulance|depannage|burger)_[a-z0-9][a-z0-9_]{0,39}\?v=[a-zA-Z0-9-]+$/.test(url))
   continue;
  assetUrls.set(key,url);
 }
}
function forPerson(p){
 const dept=String(p?.dept||'');
 const id=UID.test(String(p?.personId||''))?String(p.personId):'';
 const callCode=nameCode(p?.call);
 const matching=(scope,selector)=>rules.find(r=>r.department===dept&&r.scope===scope&&r.selector===selector);
 const group=policeUniformGroup(p),functionCode=ambulanceFunction(p),series=policeCallSeries(p.call);
 const ordered=[...(id?[matching('person',id)]:[]),
  ...(callCode?[matching('person','call_'+callCode)]:[]),
  matching('rank',nameCode(p.rank)),
  ...(functionCode?[matching('function',functionCode)]:[]),
  ...(group?[matching('group',group)]:[]),
  matching('cadre',nameCode(getTier(p))),matching('service','default')];
 let uniformCode='',badgeStyle='';
 for(const entry of ordered){
  if(!entry)continue;
  if(!badgeStyle&&['lokaal','federaal'].includes(entry.badgeStyle))badgeStyle=entry.badgeStyle;
 }
 // The old service/cadre/group and individual coat assignment fallbacks are
 // retired. Only a saved Uniformatelier composition may select a coat.
 // Personnel ranks, badges and historical assignments remain in Firestore.
 // An actual rank/function gets its own composed coat, with personal exceptions
 // taking precedence. The template is visual only; it never determines authority.
 const compScope=dept==='politie'?'call':dept==='ambulance'?'function':'rank';
 const compSelector=compScope==='call'?series:
  compScope==='function'?functionCode:nameCode(p.rank);
 const composition=compositions.find(x=>x.department===dept&&
  x.scope===compScope&&x.selector===compSelector);
 const activeCoat=composition?.assets?.uniform||'';
 if(CODE.test(activeCoat)&&!['gold','silver','default'].includes(activeCoat)&&
  assetUrls.has('uniform_'+dept+'_'+activeCoat))
  uniformCode=activeCoat;
 const elementCodes={},elementUrls={};
 for(const kind of ['rank','helmet','profession','logo','pictogram','patch']){
  const coatScope=dept==='politie'&&kind==='rank'&&series?'call':
   dept==='brandweer'&&['rank','helmet'].includes(kind)?'rank':
   dept==='ambulance'&&kind==='profession'&&functionCode?'function':'';
  const coatSelector=coatScope==='call'?series:coatScope==='rank'?nameCode(p.rank):
   coatScope==='function'?functionCode:'';
  // Personal overrides remain highest priority. Then the image chosen for
  // this actual uniform, finally the old service-wide rank fallback.
  for(const [scope,selector] of [
   ...(id?[['person',id]]:[]),
   ...(callCode?[['person','call_'+callCode]]:[]),
   ...(uniformCode&&coatScope&&coatSelector?[['uniform',coatSelector]]:[]),
   ...(series&&dept==='politie'?[['call',series]]:[]),
   ...(functionCode&&dept==='ambulance'?[['function',functionCode]]:[]),
   ['rank',nameCode(p.rank)],['cadre',nameCode(getTier(p))],['service','default']]){
   const found=scope==='uniform'?
    coatChoices.find(x=>x.department===dept&&x.uniformCode===uniformCode&&
     x.kind===kind&&x.scope===coatScope&&x.selector===selector):
    elementRules.find(x=>x.department===dept&&x.kind===kind&&
     x.scope===scope&&x.selector===selector);
   const image=found&&assetUrls.get(kind+'_'+dept+'_'+found.assetCode);
   if(image){elementCodes[kind]=found.assetCode;elementUrls[kind]=image;break;}
  }
  // A well-named upload works immediately: no manual image-to-uniform link.
  // Explicit per-person / per-grade selection above always takes priority.
  if(!elementUrls[kind]){
   const rankCode=nameCode(p.rank);
   const policeRankAliases={'100':'ap','200':'ap','300':'ainp',
    '400':'inp','500':'1inp','600':'ahinp','700':'hinp',
    '800':'1hinp','900':'1hcp','910':'1cp','920':'acp','930':'acp'};
   const candidates=kind==='rank'?
    (dept==='politie'?[series,policeRankAliases[series],rankCode]:[rankCode]):
    kind==='helmet'&&dept==='brandweer'?[rankCode]:
    kind==='profession'&&dept==='ambulance'?[functionCode]:
    [];
   for(const guessed of candidates){
    if(!guessed)continue;
    const url=assetUrls.get(kind+'_'+dept+'_'+guessed);
    if(url){elementCodes[kind]=guessed;elementUrls[kind]=url;break;}
   }
  }
 }
 if(composition?.assets){
  for(const kind of ['rank','helmet','profession','logo']){
   const selected=composition.assets[kind];
   const url=selected&&assetUrls.get(kind+'_'+dept+'_'+selected);
   const personal=elementRules.find(x=>x.department===dept&&x.kind===kind&&
    x.scope==='person'&&
    (x.selector===id||x.selector==='call_'+callCode));
   if(url&&!personal){elementCodes[kind]=selected;elementUrls[kind]=url;}
  }
 }
 return {uniformCode,badgeStyle,uniformGroup:group,callSeries:series,profession:functionCode,
  visualLayout:composition?.layers||null,elementCodes,elementUrls,
  rankUrl:elementUrls.rank||'',
  uniformUrl:uniformCode?assetUrls.get('uniform_'+dept+'_'+uniformCode)||'':''};
}
// Specialization badges are independent of uniform selection. A newly uploaded
// image with code "to" must work without a local/federal uniform badge style.
const SPECIALTY_CODES=Object.freeze({
 'semi anoniem':'semi_ano','semi-anoniem':'semi_ano','semi-ano.':'semi_ano',
 'semi_anoniem':'semi_ano','semi_ano':'semi_ano',
 'terreinondersteuner':'to','t.o.':'to','to':'to',
 'arrestatie-eenheid':'ae','arrestatie eenheid':'ae','ae':'ae',
 'ae-i':'ae','ae-t':'ae','ae-teamleader':'ae','ae-instructeur':'ae',
 'radio/bm':'radio_bm','radio bm':'radio_bm',
 'siv/wpr':'wpr','wpr':'wpr',
 'motor':'motard','motard':'motard',
 'dispatch':'disp','disp':'disp',
 'k-9':'k9','k9':'k9','rago':'rago',
 'signalisatie':'signalisatie'
});
function specialtyImage(p,name,variant=''){
 const dept=String(p?.dept||'');
 if(!['politie','brandweer','ambulance','depannage','burger'].includes(dept))return '';
 const normalized=String(name||'').trim().toLowerCase();
 const base=SPECIALTY_CODES[normalized]||nameCode(name);
 if(!CODE.test(base))return '';
 const suffix=nameCode(variant),style=forPerson(p).badgeStyle;
 const codes=[...new Set([base,nameCode(name)])].filter(x=>CODE.test(x));
 const fallbackStyles=dept==='politie'?
  (base==='rago'?['federaal','lokaal']:['lokaal','federaal']):[];
 const styles=[...new Set([style,...fallbackStyles])].filter(Boolean);
 const candidates=[];
 // Prefer explicitly uploaded variants, then general patches. Names used
 // before the central library (e.g. semi_anoniem vs semi_ano) stay supported.
 for(const code of codes){
  const bases=[...(suffix?[code+'_'+suffix]:[]),code];
  for(const part of bases){
   for(const visualStyle of styles)
    candidates.push('specialty_'+dept+'_'+part+'_'+visualStyle);
   candidates.push('specialty_'+dept+'_'+part);
   for(const visualStyle of styles)
    candidates.push('patch_'+dept+'_'+part+'_'+visualStyle);
   candidates.push('patch_'+dept+'_'+part);
  }
 }
 return candidates.map(key=>assetUrls.get(key)).find(Boolean)||'';
}
window.BPDUniformAssignments=Object.freeze({setData,forPerson,specialtyImage});
