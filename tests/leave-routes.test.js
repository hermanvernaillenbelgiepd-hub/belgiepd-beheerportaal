import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installLeaveRoutes } from '../src/leave-routes.js';

// End-to-end HTTP guard test without contacting Firebase or Google Sheets.
// The auth middleware is deliberately stubbed to allow testing the independent
// server-side write-disable protection for already-authenticated users.
test('alle verlofschrijfoperaties blijven geblokkeerd zolang de featurevlag uit staat', async () => {
  const old = process.env.BPD_ENABLE_LEAVE_WRITES;
  process.env.BPD_ENABLE_LEAVE_WRITES = 'false';
  const app = express();
  app.use('/api/leave', express.json({limit:'4kb',strict:true}));
  installLeaveRoutes(app, {
    requireUser: (_req, _res, next) => next(),
    getSnapshot: async () => { throw Error('Snapshot mag niet worden aangesproken'); },
    accessList: () => ({})
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const url = 'http://127.0.0.1:' + server.address().port;
    const writePaths = [
      '/api/leave/requests',
      '/api/leave/requests/example123456/decision',
      '/api/leave/grants',
      '/api/leave/grants/revoke'
    ];
    for (const path of writePaths) {
      const response = await fetch(url + path, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:'{}'
      });
      assert.equal(response.status, 503, path + ' mag niet schrijven');
      const body = await response.json();
      assert.match(body.error, /Schrijfacties staan uit/);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (old === undefined) delete process.env.BPD_ENABLE_LEAVE_WRITES;
    else process.env.BPD_ENABLE_LEAVE_WRITES = old;
  }
});
