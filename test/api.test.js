import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { makeApi } from '../server/api.js';
import { accessCode } from '../server/telegram.js';

const mentor = { id: 'mentor-1', name: 'Макар', role: 'mentor', pending: false };
const mentee = { id: 'mentee-1', name: 'Аня', role: 'mentee', pending: false };
const cookie = 'learn_session=' + 'a'.repeat(64);

// Подмена PostgreSQL: сессия отдаёт заданного актёра, остальные запросы пустые.
function fakeDatabase(actor) {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: actor && sql.includes('FROM sessions') ? [actor] : [], rowCount: 0 };
    },
  };
  return { queries, ready: async () => client, transaction: (operation) => operation(client), close() {} };
}

async function call(api, { method = 'GET', url, headers = {}, body }) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  Object.assign(request, { method, url, headers: { host: 'localhost:5188', ...headers } });
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
    end(data) { this.body = data; },
  };
  await api.middleware(request, response);
  return { status: response.status, data: JSON.parse(response.body) };
}

const post = (url, body, headers = {}) => ({
  method: 'POST', url, body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie, ...headers },
});

test('reports a missing database', async () => {
  const { status } = await call(makeApi({}), { url: '/state' });
  assert.equal(status, 503);
});

test('state without a session is empty', async () => {
  const { status, data } = await call(makeApi({}, fakeDatabase(null)), { url: '/state' });
  assert.equal(status, 200);
  assert.deepEqual(data, { account: null, people: [], tasks: [], telegram: false });
});

test('pending mentee sees no data', async () => {
  const api = makeApi({ TELEGRAM_BOT_TOKEN: 't' }, fakeDatabase({ ...mentee, pending: true }));
  const { data } = await call(api, { url: '/state', headers: { cookie } });
  assert.equal(data.account.pending, true);
  assert.deepEqual(data.people, []);
  assert.equal(data.telegram, true);
});

test('access code is for the mentor only', async () => {
  const env = { ACCESS_CODE_SECRET: 'secret' };
  const allowed = await call(makeApi(env, fakeDatabase(mentor)), { url: '/access-code', headers: { cookie } });
  assert.deepEqual(allowed, { status: 200, data: { code: accessCode('secret', mentor.id) } });
  assert.equal((await call(makeApi(env, fakeDatabase(mentee)), { url: '/access-code', headers: { cookie } })).status, 403);
  assert.equal((await call(makeApi(env, fakeDatabase(null)), { url: '/access-code' })).status, 403);
  assert.equal((await call(makeApi({}, fakeDatabase(mentor)), { url: '/access-code', headers: { cookie } })).status, 503);
});

test('POST checks origin, content type and body', async () => {
  const api = makeApi({}, fakeDatabase(mentee));
  const route = '/people/3f2b8c1e-7a4d-4e9b-9c1f-0a1b2c3d4e5f/layers';
  assert.equal((await call(api, post(route, {}, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await call(api, post(route, {}, { 'content-type': 'text/plain' }))).status, 422);
  assert.equal((await call(api, { ...post(route, {}), body: '[1]' })).status, 400);
  assert.equal((await call(api, { ...post(route, {}), body: '{broken' })).status, 400);
});

test('POST requires an active session', async () => {
  const route = '/people/3f2b8c1e-7a4d-4e9b-9c1f-0a1b2c3d4e5f/layers';
  assert.equal((await call(makeApi({}, fakeDatabase(null)), post(route, {}))).status, 403);
  assert.equal((await call(makeApi({}, fakeDatabase({ ...mentee, pending: true })), post(route, {}))).status, 403);
});

test('mutation of a profile outside the mentor link is refused', async () => {
  // Фейковая база не находит профиль, как и настоящая для чужого ученика.
  const database = fakeDatabase(mentee);
  const { status } = await call(makeApi({}, database), post('/people/3f2b8c1e-7a4d-4e9b-9c1f-0a1b2c3d4e5f/layers', { cover: 'sky' }));
  assert.equal(status, 403);
  assert.ok(!database.queries.some(({ sql }) => sql.startsWith('UPDATE')));
});

test('local sign-in is closed without a setup token or on a public origin', async () => {
  const body = { token: 'x'.repeat(64) };
  assert.equal((await call(makeApi({}, fakeDatabase(null)), post('/local', body))).status, 403);
  const publicEnv = { LOCAL_SETUP_TOKEN: body.token, PUBLIC_ORIGIN: 'https://learn.example' };
  assert.equal((await call(makeApi(publicEnv, fakeDatabase(null)), post('/local', body, { origin: 'https://learn.example' }))).status, 403);
  assert.equal((await call(makeApi({ LOCAL_SETUP_TOKEN: body.token }, fakeDatabase(null)), post('/local', { token: 'wrong' }))).status, 403);
});

test('telegram sign-in needs a configured bot and a valid signature', async () => {
  assert.equal((await call(makeApi({}, fakeDatabase(null)), post('/telegram', { initData: 'x' }))).status, 403);
  assert.equal((await call(makeApi({ TELEGRAM_BOT_TOKEN: 't' }, fakeDatabase(null)), post('/telegram', { initData: 'hash=00' }))).status, 403);
});

test('activation validates the code format and role', async () => {
  assert.equal((await call(makeApi({}, fakeDatabase({ ...mentee, pending: true })), post('/activate', { code: '12a456' }))).status, 422);
  assert.equal((await call(makeApi({}, fakeDatabase(mentor)), post('/activate', { code: '123456' }))).status, 403);
});

test('unknown routes return 404', async () => {
  const api = makeApi({}, fakeDatabase(mentee));
  assert.equal((await call(api, { url: '/nope', headers: { cookie } })).status, 404);
  assert.equal((await call(api, post('/people/not-a-uuid/layers', {}))).status, 404);
  assert.equal((await call(api, { url: '/photo/not-a-uuid', headers: { cookie } })).status, 404);
});
