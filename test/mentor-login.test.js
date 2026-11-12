import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { makeApi } from '../server/api.js';
import { attemptLimiter, hashSecret, mentorCredentialsValid, mentorLoginConfigured, verifySecret } from '../server/mentor-login.js';

const env = { MENTOR_EMAIL: 'Mentor@Example.com', MENTOR_PASSWORD_HASH: hashSecret('correct horse'), MENTOR_PIN_HASH: hashSecret('4821') };
const valid = { email: ' mentor@example.com ', password: 'correct horse', pin: '4821' };

test('hashSecret is salted and verifiable', () => {
  const stored = hashSecret('secret');
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.notEqual(stored, hashSecret('secret'));
  assert.equal(verifySecret('secret', stored), true);
  assert.equal(verifySecret('Secret', stored), false);
  assert.equal(verifySecret('', stored), false);
  assert.equal(verifySecret('secret', 'broken'), false);
  assert.equal(verifySecret('secret', undefined), false);
  assert.equal(verifySecret(undefined, stored), false);
});

test('mentor credentials need email, password and PIN together', () => {
  assert.equal(mentorLoginConfigured(env), true);
  assert.equal(mentorLoginConfigured({ ...env, MENTOR_PIN_HASH: '' }), false);
  assert.equal(mentorCredentialsValid(env, valid), true);
  assert.equal(mentorCredentialsValid(env, { ...valid, email: 'other@example.com' }), false);
  assert.equal(mentorCredentialsValid(env, { ...valid, password: 'wrong' }), false);
  assert.equal(mentorCredentialsValid(env, { ...valid, pin: '0000' }), false);
  assert.equal(mentorCredentialsValid(env, { ...valid, pin: 4821 }), false);
  assert.equal(mentorCredentialsValid(env, {}), false);
});

test('attemptLimiter blocks after five failures and recovers', () => {
  const limiter = attemptLimiter(5, 1000);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(limiter.blocked(100), false);
    limiter.fail(100);
  }
  assert.equal(limiter.blocked(500), true);
  assert.equal(limiter.blocked(1200), false);
  limiter.fail(1300);
  limiter.reset();
  assert.equal(limiter.blocked(1300), false);
});

function fakeDatabase() {
  const client = {
    async query(sql) {
      if (sql.includes("role = 'mentor' ORDER BY id")) return { rows: [{ id: 'mentor-1' }] };
      if (sql.includes('FROM sessions')) return { rows: [{ id: 'mentor-1', name: 'Макар', role: 'mentor', pending: false }] };
      return { rows: [] };
    },
  };
  return { ready: async () => client, transaction: (operation) => operation(client), close() {} };
}

async function signIn(api, body) {
  const request = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST', url: '/mentor', headers: { host: 'localhost:5188', 'content-type': 'application/json' },
  });
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    writeHead(status) { this.status = status; },
    end(data) { this.body = JSON.parse(data); },
  };
  await api.middleware(request, response);
  return response;
}

test('POST /mentor opens a mentor session with valid credentials', async () => {
  const response = await signIn(makeApi(env, fakeDatabase()), valid);
  assert.equal(response.status, 200);
  assert.equal(response.body.account.role, 'mentor');
  assert.match(response.headers['Set-Cookie'], /^learn_session=[0-9a-f]{64}; Path=\/; HttpOnly/);
});

test('POST /mentor is closed when not configured and limits wrong attempts', async () => {
  assert.equal((await signIn(makeApi({}, fakeDatabase()), valid)).status, 403);
  const api = makeApi(env, fakeDatabase());
  for (let index = 0; index < 5; index += 1) {
    const response = await signIn(api, { ...valid, pin: '0000' });
    assert.equal(response.status, 403);
    assert.equal(response.headers['Set-Cookie'], undefined);
  }
  assert.equal((await signIn(api, valid)).status, 429);
});
