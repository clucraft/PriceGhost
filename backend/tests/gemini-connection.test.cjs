// Run after npm run build: node --test tests/gemini-connection.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');

test('Gemini connection test uses the selected model or the extraction default', async () => {
  const calls = [];
  const originalLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (name === '../middleware/auth') return { authMiddleware: (_req, _res, next) => next() };
    if (name === '../models') return { userQueries: {} };
    if (name === '@google/generative-ai') return {
      GoogleGenerativeAI: class {
        getGenerativeModel({ model }) {
          calls.push(model);
          return { generateContent: async () => ({}) };
        }
      },
    };
    return originalLoad.call(this, name, parent, isMain);
  };
  let server;
  try {
    const router = require('../dist/routes/settings').default;
    const { DEFAULT_GEMINI_MODEL } = require('../dist/config/gemini');
    assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.5-flash-lite');
    const app = express();
    app.use(express.json(), router);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/ai/test-gemini`;
    for (const [model, expected] of [
      [undefined, DEFAULT_GEMINI_MODEL],
      ['', DEFAULT_GEMINI_MODEL],
      ['   ', DEFAULT_GEMINI_MODEL],
      [null, DEFAULT_GEMINI_MODEL],
      ['gemini-2.5-pro', 'gemini-2.5-pro'],
      [' custom-model ', 'custom-model'],
    ]) {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: 'test-placeholder', model }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).success, true);
      assert.equal(calls.at(-1), expected);
    }
    const count = calls.length;
    for (const body of [{ api_key: 'test-placeholder', model: {} }, { model: 'custom-model' }]) {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      await response.json();
      assert.equal(calls.length, count);
    }
  } finally {
    Module._load = originalLoad;
    if (server) await new Promise(resolve => server.close(resolve));
  }
});
