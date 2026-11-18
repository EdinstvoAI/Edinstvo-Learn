import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { makeApi } from '../server/api.js';
import { accessCode } from '../server/telegram.js';

const mentor = { id: 'mentor-1', name: 'Макар', role: 'mentor', pending: false };
const mentee = { id: 'mentee-1', name: 'Аня', role: 'mentee', pending: false };
const cookie = 'learn_session=' + 'a'.repeat(64);

// Подмена PostgreSQL: сессия отдаёт заданного актёра, остальные запросы пустые.
function fakeDatabase(actor, profile) {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (profile && sql.includes('SELECT profile, telegram_id') && values[0] === projectOwner && values[1] === actor.id) {
        return { rows: [{ profile: structuredClone(profile) }] };
      }
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

const projectOwner = '3f2b8c1e-7a4d-4e9b-9c1f-0a1b2c3d4e5f';
const projectId = '7968c571-268d-4e27-8717-3a85d206aa61';
const projectRoute = (action) => '/people/' + projectOwner + '/' + action;

test('mentor reset clears learning data for one mentee and preserves their phone', async () => {
  const db = fakeDatabase(mentor, { soft: [50], projects: [{ id: projectId }], phone: '+70000000000' });
  const result = await call(makeApi({}, db), post(projectRoute('reset-mentee'), { confirm: true }));
  assert.equal(result.status, 200);
  assert.deepEqual(db.queries.slice(-3), [
    { sql: 'DELETE FROM tasks WHERE person = $1', values: [projectOwner] },
    { sql: 'DELETE FROM photos WHERE person = $1', values: [projectOwner] },
    { sql: 'UPDATE accounts SET profile = $1 WHERE id = $2', values: [{ phone: '+70000000000' }, projectOwner] },
  ]);
});

test('reset requires mentor ownership and explicit confirmation', async () => {
  for (const [actor, profile, confirm, status] of [
    [mentee, {}, true, 403], [mentor, undefined, true, 403], [mentor, {}, false, 422],
  ]) {
    const db = fakeDatabase(actor, profile);
    const result = await call(makeApi({}, db), post(projectRoute('reset-mentee'), { confirm }));
    assert.equal(result.status, status);
    assert.ok(!db.queries.some(({ sql }) => /^(DELETE|UPDATE)/.test(sql)));
  }
});

test('project edits preserve its identity and comments', async () => {
  const comments = [{ text: 'review' }];
  const db = fakeDatabase(mentor, { projects: [{ id: projectId, name: 'old', comments }] });
  const result = await call(makeApi({}, db), post(projectRoute('edit-project'), {
    projectId, name: 'NEW', description: 'desc', folder: 'gel', links: [{ name: 'repo', url: 'https://example.com/A' }],
  }));
  assert.equal(result.status, 200);
  assert.deepEqual(db.queries.at(-1).values[0].projects, [{
    id: projectId, name: 'new', description: 'desc', folder: 'gel', comments,
    sources: [{ type: 'repo', url: 'https://example.com/A' }],
  }]);
});

test('project deletion detaches only that project’s tasks and keeps other projects', async () => {
  const other = { id: 'another-project' };
  const db = fakeDatabase(mentee, { projects: [{ id: projectId }, other] });
  const result = await call(makeApi({}, db), post(projectRoute('delete-project'), { projectId }));
  assert.equal(result.status, 200);
  const detach = db.queries.find(({ sql }) => sql.startsWith('UPDATE tasks'));
  assert.match(detach.sql, /SET project_id = NULL WHERE person = \$1 AND project_id = \$2/);
  assert.deepEqual(detach.values, [projectOwner, projectId]);
  assert.deepEqual(db.queries.at(-1).values[0].projects, [other]);
});

test('project changes reject an unknown project and an inaccessible profile', async () => {
  for (const profile of [{ projects: [] }, undefined]) {
    const db = fakeDatabase(mentee, profile);
    for (const action of ['edit-project', 'delete-project']) {
      assert.equal((await call(makeApi({}, db), post(projectRoute(action), { projectId, name: 'new' }))).status, 403);
    }
    assert.ok(!db.queries.some(({ sql }) => sql.startsWith('UPDATE')));
  }
});

test('reports a missing database', async () => {
  const { status } = await call(makeApi({}), { url: '/state' });
  assert.equal(status, 503);
});

test('state without a session is empty', async () => {
  const { status, data } = await call(makeApi({}, fakeDatabase(null)), { url: '/state' });
  assert.equal(status, 200);
  assert.deepEqual(data, { account: null, people: [], tasks: [], telegram: false, local: false });
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

test('local join is closed outside local mode and checks the code format', async () => {
  assert.equal((await call(makeApi({}, fakeDatabase(null)), post('/local/join', { name: 'Аня', code: '123456' }))).status, 403);
  const publicEnv = { LOCAL_SETUP_TOKEN: 'x'.repeat(64), PUBLIC_ORIGIN: 'https://learn.example' };
  assert.equal((await call(makeApi(publicEnv, fakeDatabase(null)), post('/local/join', { name: 'Аня' }, { origin: 'https://learn.example' }))).status, 403);
  const { status, data } = await call(makeApi({}, fakeDatabase(null)), { url: '/state' });
  assert.equal(status, 200);
  assert.equal(data.local, false);
});

test('Telegram webhook welcomes /start in private chats and requires its secret', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_WEBHOOK_SECRET: 'secret', PUBLIC_ORIGIN: 'https://learn.example.org' };
  const update = { message: { chat: { type: 'private', id: 42 }, text: '/start learn' } };
  const endpoint = '/telegram/webhook';
  assert.equal((await call(makeApi(env), post(endpoint, update))).status, 403);
  const headers = { 'x-telegram-bot-api-secret-token': 'secret' };
  assert.deepEqual((await call(makeApi(env), post(endpoint, update, headers))).data, {
    method: 'sendMessage', chat_id: 42, text: 'привет! это единство learn. здесь твои навыки, задачи и проекты.',
    reply_markup: { inline_keyboard: [[{ text: 'открыть приложение', web_app: { url: 'https://learn.example.org/' } }]] },
  });
  const fallback = await call(makeApi({ ...env, PUBLIC_ORIGIN: '' }), post(endpoint, update, headers));
  assert.match(fallback.data.text, /недоступно/);
  update.message.chat.type = 'group';
  assert.deepEqual((await call(makeApi(env), post(endpoint, update, headers))).data, {});
});
