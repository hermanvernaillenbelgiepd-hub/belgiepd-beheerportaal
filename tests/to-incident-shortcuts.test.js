import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyTOShortcutCommand,emptyTOShortcuts,TO_SHORTCUT_LIMIT} from '../src/to-incident-shortcuts.js';

const actor={uid:'discord:111111111111111111'};
const now=Date.UTC(2026,9,21);
const perform=(document,action,fields={})=>applyTOShortcutCommand(document,
  {action,expectedRevision:document.revision,...fields},{actor,now,id:randomUUID});
const invalid=(callback,status)=>assert.throws(callback,error=>error.publicStatus===status);

test('Saving a quick message stores only generic title and description, never a postcode',()=>{
  const initial=emptyTOShortcuts(),result=perform(initial,'add',{title:'  VERKEERSHINDER  ',description:''});
  const saved=Object.values(result.items)[0];
  assert.deepEqual(initial,emptyTOShortcuts(),'Source is never mutated');
  assert.equal(result.revision,1);
  assert.equal(saved.title,'VERKEERSHINDER');
  assert.equal(saved.description,'');
  assert.equal(saved.createdBy,actor.uid);
  assert.ok(saved.id);
  assert.equal(Object.hasOwn(saved,'postcode'),false);
  const removed=perform(result,'remove',{id:saved.id});
  assert.equal(removed.revision,2);
  assert.deepEqual(removed.items,{});
  assert.ok(result.items[saved.id]);
});

test('Validation blocks duplicate shortcuts, extra fields, invalid IDs and stale revisions',()=>{
  const stored=perform(emptyTOShortcuts(),'add',{title:' ANPR ',description:''});
  invalid(()=>perform(stored,'add',{title:'anpr',description:''}),409);
  invalid(()=>perform(stored,'add',{title:'ANPR',postcode:'1500'}),400);
  invalid(()=>perform(stored,'add',{title:'<img>',description:''}),400);
  invalid(()=>perform(stored,'add',{title:'A'.repeat(81),description:''}),400);
  invalid(()=>perform(stored,'add',{title:'Nieuwe',description:'A'.repeat(501)}),400);
  invalid(()=>perform(stored,'remove',{id:'abc'}),400);
  invalid(()=>perform(stored,'remove',{id:randomUUID()}),409);
  invalid(()=>applyTOShortcutCommand(stored,{action:'add',expectedRevision:0,title:'nieuwe'},
    {actor,now,id:randomUUID}),409);
  invalid(()=>applyTOShortcutCommand(stored,{action:'add',expectedRevision:1,title:'nieuwe'},
    {actor:null,now,id:randomUUID}),403);
});

test('A maximum of 30 templates remains available across separate shifts',()=>{
  let shortcuts=emptyTOShortcuts();
  for(let i=0;i<TO_SHORTCUT_LIMIT;i++)shortcuts=perform(shortcuts,'add',{title:'Melding '+i,description:''});
  assert.equal(Object.keys(shortcuts.items).length,TO_SHORTCUT_LIMIT);
  assert.equal(shortcuts.revision,TO_SHORTCUT_LIMIT);
  invalid(()=>perform(shortcuts,'add',{title:'Extra',description:''}),413);
  // No session/board data is included in the independent shortcut document.
  assert.deepEqual(Object.keys(shortcuts).sort(),['items','revision']);
});
