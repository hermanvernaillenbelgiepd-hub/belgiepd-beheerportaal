const ID=/^[1-9][0-9]{0,5}$/;
const eventKinds=new Set(['activated','cleared']);
const round=n=>Math.round(n*100)/100;
export function parseTOPanicEvent(value,now=Date.now()){
  if(!value||typeof value!=='object'||Array.isArray(value)||
      !eventKinds.has(value.event)||!ID.test(String(value.serverId||'')))throw Object.assign(new Error('Ongeldig noodsignaal'),{publicStatus:400});
  if(!Number.isSafeInteger(value.occurredAt)||Math.abs(now-value.occurredAt)>5*60000)
    throw Object.assign(new Error('Noodsignaal buiten toegestane tijdsperiode'),{publicStatus:400});
  const name=typeof value.name==='string'?value.name.replace(/[\x00-\x1f\x7f<>]/g,' ').trim().slice(0,80):'';
  if(!name)throw Object.assign(new Error('Ontbrekende FiveM-spelernaam'),{publicStatus:400});
  const position=value.position;
  let coords=null;
  if(position!==null&&position!==undefined){
    if(typeof position!=='object'||Array.isArray(position)||
       !['x','y','z'].every(k=>typeof position[k]==='number'&&Number.isFinite(position[k])&&Math.abs(position[k])<=20000))
       throw Object.assign(new Error('Ongeldige FiveM-spelcoördinaten'),{publicStatus:400});
    coords={x:round(position.x),y:round(position.y),z:round(position.z)};
  }
  const heading=typeof value.heading==='number'&&Number.isFinite(value.heading)&&value.heading>=0&&value.heading<=360?round(value.heading):null;
  return {serverId:String(value.serverId),name,event:value.event,active:value.event==='activated',
    position:coords,heading,occurredAt:value.occurredAt};
}
export function publicTOPanics(items,now=Date.now()){
  return (items||[]).filter(p=>p&&p.active===true&&Number.isSafeInteger(p.receivedAt))
    .slice(0,40).map(p=>({serverId:String(p.serverId||''),name:String(p.name||'Onbekende speler').slice(0,80),
      active:true,receivedAt:p.receivedAt,
      old:now-p.receivedAt>10*60000,
      position:p.position&&['x','y','z'].every(k=>typeof p.position[k]==='number')?p.position:null,
      heading:typeof p.heading==='number'?p.heading:null}));
}
