import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTOPanicEvent,publicTOPanics} from '../src/to-panic-policy.js';

const now=Date.UTC(2026,9,21,19,0);
const example={event:'activated',serverId:930,name:'Hubert',
  position:{x:156.123,y:-987.455,z:30},heading:157.4,occurredAt:now};

test('panic event accepts FiveM coordinates without exposing identifying metadata',()=>{
  const event=parseTOPanicEvent({...example,identifiers:['license:secret']},now);
  assert.equal(event.active,true);
  assert.equal(event.name,'Hubert');
  assert.deepEqual(event.position,{x:156.12,y:-987.45,z:30});
  assert.equal(event.heading,157.4);
  assert.equal('identifiers' in event,false);
  assert.equal(parseTOPanicEvent({...example,event:'cleared',position:null},now).active,false);
});
test('panic event rejects spoofed IDs, stale messages and invalid locations',()=>{
  for(const payload of [
    {...example,serverId:'../../../'},
    {...example,occurredAt:now-600001},
    {...example,occurredAt:now+600001},
    {...example,position:{x:Infinity,y:1,z:2}},
    {...example,position:{x:1,y:'-100',z:2}},
    {...example,event:'unknown'}
  ])assert.throws(()=>parseTOPanicEvent(payload,now),error=>error.publicStatus===400);
});
test('only active panic events are exposed with a stale-signal flag',()=>{
  const active={...parseTOPanicEvent(example,now),active:true,receivedAt:now-11*60000};
  const cleared={...active,active:false};
  assert.deepEqual(publicTOPanics([cleared,active],now).map(p=>p.old),[true]);
  assert.equal(publicTOPanics([cleared],now).length,0);
});
