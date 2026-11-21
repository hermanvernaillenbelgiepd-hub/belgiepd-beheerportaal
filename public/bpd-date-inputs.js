// Pasteable day/month/year control with native calendar, retaining the
// original date input's ISO value and all server-side validation.
export function parseBelgianDateInput(value){
 const text=String(value||'').trim();
 let d,m,y,k;
 if((k=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text))){
   y=Number(k[1]);m=Number(k[2]);d=Number(k[3]);
 }else if((k=/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text))){
   d=Number(k[1]);m=Number(k[2]);y=Number(k[3]);
 }else if((k=/^(\d{2})(\d{2})(\d{4})$/.exec(text))){
   d=Number(k[1]);m=Number(k[2]);y=Number(k[3]);
 }else return '';
 const date=new Date(Date.UTC(y,m-1,d));
 if(y<1000||y>9999||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||
    date.getUTCDate()!==d)return '';
 return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
export function formatBelgianDateInput(iso){
 const p=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));
 return p?p[3]+'/'+p[2]+'/'+p[1]:'';
}
const CSS=`
.bpd-date-field{display:flex;align-items:center;gap:6px;position:relative;width:100%;min-width:0}
.bpd-date-field .bpd-date-text{min-width:0;flex:1 1 auto;width:100%;font:inherit}
.bpd-date-field .bpd-date-calendar{flex:0 0 40px;width:40px;height:40px;
 display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
 border:1px solid #52739b;border-radius:7px;background:#213e65;color:#f6faff;font-size:18px}
.bpd-date-field .bpd-date-calendar:hover,.bpd-date-field .bpd-date-calendar:focus-visible{
 border-color:#9fc6fa;outline-offset:2px}
.bpd-date-field .bpd-native-date{position:absolute;right:17px;top:50%;width:1px!important;
 height:1px!important;min-width:0!important;padding:0!important;margin:0!important;
 opacity:0;pointer-events:none;border:0!important}
.bpd-date-field .bpd-native-date.bpd-date-fallback{position:static;opacity:1;
 pointer-events:auto;width:145px!important;height:auto!important;padding:8px!important;
 border:1px solid #52739b!important}
:root[data-bpd-theme="light"] .bpd-date-calendar{background:#ebf3ff;color:#193657}
`;
export function enhanceBelgianDateInputs(ids){
 if(typeof document==='undefined')return;
 if(!document.getElementById('bpd-uniform-date-style')){
   const style=document.createElement('style');
   style.id='bpd-uniform-date-style';style.textContent=CSS;document.head.append(style);
 }
 for(const id of ids){
   const native=document.getElementById(id);
   if(!native||native.type!=='date'||native.dataset.bpdDateEnhanced==='1')continue;
   const wrapper=document.createElement('div');wrapper.className='bpd-date-field';
   const field=document.createElement('input');field.type='text';
   field.id=id+'Text';field.className='bpd-date-text';field.inputMode='numeric';
   field.maxLength=10;field.autocomplete='off';field.placeholder='dd/mm/jjjj';
   field.required=native.required;
   const label=document.querySelector('label[for="'+id+'"]');
   if(label)label.htmlFor=field.id;
   native.required=false;native.classList.add('bpd-native-date');
   native.tabIndex=-1;native.setAttribute('aria-hidden','true');
   native.dataset.bpdDateEnhanced='1';
   const button=document.createElement('button');button.type='button';
   button.className='bpd-date-calendar';button.title='Kies een datum via de kalender';
   button.setAttribute('aria-label','Kies een datum via de kalender');
   button.textContent='📅';
   native.parentNode.insertBefore(wrapper,native);
   wrapper.append(field,native,button);
   const mirror=()=>{field.value=formatBelgianDateInput(native.value);field.setCustomValidity('')};
   const read=()=>{
     const iso=parseBelgianDateInput(field.value);
     native.value=iso;
     const invalid=field.value.trim()&&(!iso||native.min&&iso<native.min||
       native.max&&iso>native.max);
     field.setCustomValidity(invalid?'Vul een geldige datum in als DD/MM/JJJJ.':'');
     native.dispatchEvent(new Event('input',{bubbles:true}));
   };
   field.addEventListener('input',read);
   field.addEventListener('change',()=>{
     read();if(native.value)field.value=formatBelgianDateInput(native.value);
     native.dispatchEvent(new Event('change',{bubbles:true}));
   });
   native.addEventListener('change',mirror);
   button.addEventListener('click',()=>{
     try{if(typeof native.showPicker==='function'){native.showPicker();return}}catch{}
     native.classList.add('bpd-date-fallback');
     native.removeAttribute('aria-hidden');native.tabIndex=0;native.focus();button.hidden=true;
   });
   native.form?.addEventListener('reset',()=>setTimeout(mirror,0));
   mirror();
 }
}
export function refreshBelgianDateInputs(ids){
 if(typeof document==='undefined')return;
 for(const id of ids){
   const native=document.getElementById(id),field=document.getElementById(id+'Text');
   if(native&&field){field.value=formatBelgianDateInput(native.value);field.setCustomValidity('')}
 }
}
