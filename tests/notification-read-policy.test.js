import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationReadByViewer,canSeeSeriesLeaveNotification} from '../src/notification-read-policy.js';
import {SERIES_LEADERS} from '../src/training-request-policy.js';

test('a read receipt belongs only to the recipient who acknowledged it',()=>{
 const a='947114717724413952',b='298799630458552323';
 const record={status:'nieuw',readBy:{[a]:{status:'nieuw',at:'2026-11-05'}}};
 assert.equal(notificationReadByViewer(record,a),true);
 assert.equal(notificationReadByViewer(record,b),false);
 assert.equal(notificationReadByViewer(record,''),false);
});
test('a new decision makes the notification unread again for the same person',()=>{
 const a='947114717724413952';
 const record={status:'nieuw',readBy:{[a]:{status:'nieuw'}}};
 assert.equal(notificationReadByViewer(record,a),true);
 record.status='gepland';
 assert.equal(notificationReadByViewer(record,a),false);
 record.readBy[a]={status:'gepland'};
 assert.equal(notificationReadByViewer(record,a),true);
});
test('only a police series leader sees pending notices from their own series',()=>{
 const owner=SERIES_LEADERS['01'][0],other=SERIES_LEADERS['02'][0];
 const subject={series:'01'};
 const record={personDiscordId:'111111111111111111',status:'pending'};
 assert.equal(canSeeSeriesLeaveNotification(owner,true,subject,record),true);
 assert.equal(canSeeSeriesLeaveNotification(other,true,subject,record),false);
 assert.equal(canSeeSeriesLeaveNotification(owner,false,subject,record),false);
 assert.equal(canSeeSeriesLeaveNotification(owner,true,subject,{...record,personDiscordId:owner}),false);
});
test('automatic leave approvals are visible for 72 hours only',()=>{
 const owner=SERIES_LEADERS['01'][0],now=Date.now(),subject={series:'01'};
 const record={personDiscordId:'111111111111111111',status:'approved',autoApproved:true,
   createdAt:{toMillis:()=>now-71*60*60*1000}};
 assert.equal(canSeeSeriesLeaveNotification(owner,true,subject,record,now),true);
 assert.equal(canSeeSeriesLeaveNotification(owner,true,subject,{
   ...record,createdAt:{toMillis:()=>now-73*60*60*1000}},now),false);
 assert.equal(canSeeSeriesLeaveNotification(owner,true,subject,{
   ...record,autoApproved:false},now),false);
});
