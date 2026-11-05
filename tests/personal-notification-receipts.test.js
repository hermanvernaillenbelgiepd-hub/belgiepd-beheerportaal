import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Verlofmeldingen van dezelfde reeks hebben leesstatus per Discord-ontvanger',()=>{
 const routes=read('src/leave-routes.js'),ui=read('public/meldingen.html');
 assert.match(routes,/readAt:iso\(r\.seriesReadBy\?\.\[owner\]\)/);
 assert.match(routes,/series-notifications\/:id\/read',requireUser/);
 assert.match(routes,/SERIES_LEADERS[\s\S]*?assigned\.includes\(personSeries\(subject\)\)/);
 assert.match(routes,/new FieldPath\('seriesReadBy',owner\)/);
 assert.match(ui,/addSeriesReadConfirmation\(row,record\)/);
 assert.match(ui,/series-notifications\/'\+encodeURIComponent\(record\.id\)\+'\/read'/);
});

test('Opleiding GELEZEN verandert geen gedeelde aanvraagstatus of planning',()=>{
 const routes=read('src/training-request-routes.js'),ui=read('public/meldingen.html');
 assert.match(routes,/readAt:iso\(request\.readBy\?\.\[ctx\.id\]\)/);
 assert.match(routes,/if\(!reviewScope\(ctx,old\)\)throw rejection/);
 assert.match(routes,/if\(action==='gelezen'\)\{[\s\S]*?new FieldPath\('readBy',ctx\.id\)[\s\S]*?return old\.status;/);
 assert.match(ui,/if\(action==='gelezen'\)continue;/);
 assert.match(ui,/r\.readAt/);
});
