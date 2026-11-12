import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { accessCode, hash, safeEqual, telegramParams, telegramPhone, telegramUser } from '../server/telegram.js';

const botToken = '123456:TEST-TOKEN';
const now = Date.parse('2026-11-12T10:00:00Z');

// Подписывает данные так же, как Telegram подписывает initData Mini App.
function sign(fields, token = botToken) {
  const params = new URLSearchParams(fields);
  params.sort();
  const data = [...params].map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return params.toString();
}

const authDate = String(now / 1000 - 60);
const userData = (user, date = authDate) => sign({ auth_date: date, query_id: 'q', user: JSON.stringify(user) });

test('safeEqual compares strings only', () => {
  assert.equal(safeEqual('123456', '123456'), true);
  assert.equal(safeEqual('123456', '123457'), false);
  assert.equal(safeEqual('123456', '1234567'), false);
  assert.equal(safeEqual(null, null), false);
  assert.equal(safeEqual(123456, '123456'), false);
  assert.match(hash('a'), /^[0-9a-f]{64}$/);
});

test('telegramParams accepts a fresh valid signature', () => {
  const params = telegramParams(userData({ id: 7, first_name: 'Аня' }), botToken, now);
  assert.equal(params.get('query_id'), 'q');
  assert.equal(params.has('hash'), false);
});

test('telegramParams rejects forged, stale and malformed data', () => {
  const valid = userData({ id: 7, first_name: 'Аня' });
  assert.equal(telegramParams(valid, 'other:token', now), null);
  assert.equal(telegramParams(valid.replace('q', 'x'), botToken, now), null);
  assert.equal(telegramParams(valid, botToken, now + 601_000 - 60_000), null);
  assert.equal(telegramParams(userData({ id: 7 }, String(now / 1000 + 120)), botToken, now), null);
  assert.equal(telegramParams(sign({ user: '{}' }), botToken, now), null);
  assert.equal(telegramParams(valid, '', now), null);
  assert.equal(telegramParams(undefined, botToken, now), null);
  assert.equal(telegramParams('a'.repeat(8193), botToken, now), null);
  assert.equal(telegramParams('auth_date=' + authDate, botToken, now), null);
});

test('telegramUser normalises the profile', () => {
  const user = telegramUser(userData({
    id: 42, first_name: ' Аня', last_name: 'Петрова ', username: 'anya_p', photo_url: 'https://t.me/i/userpic/320/a.jpg',
  }), botToken, now);
  assert.deepEqual(user, { id: '42', name: 'Аня Петрова', photoUrl: 'https://t.me/i/userpic/320/a.jpg', username: 'anya_p' });
});

test('telegramUser drops unsafe optional fields and invalid users', () => {
  const user = telegramUser(userData({ id: 42, first_name: 'Аня', username: 'bad name', photo_url: 'http://t.me/a.jpg' }), botToken, now);
  assert.deepEqual(user, { id: '42', name: 'Аня', photoUrl: null, username: null });
  assert.equal(telegramUser(userData({ id: 42 }), botToken, now), null);
  assert.equal(telegramUser(userData({ id: '42', first_name: 'Аня' }), botToken, now), null);
  assert.equal(telegramUser(userData({ id: 0, first_name: 'Аня' }), botToken, now), null);
  assert.equal(telegramUser(sign({ auth_date: authDate, user: '{broken' }), botToken, now), null);
  assert.equal(telegramUser(sign({ auth_date: authDate }), botToken, now), null);
});

test('telegramPhone returns the number only for the account owner', () => {
  const contact = (value) => sign({ auth_date: authDate, contact: JSON.stringify(value) });
  assert.equal(telegramPhone(contact({ user_id: 42, phone_number: '79001234567' }), botToken, '42', now), '+79001234567');
  assert.equal(telegramPhone(contact({ user_id: 42, phone_number: '+79001234567' }), botToken, '42', now), '+79001234567');
  assert.equal(telegramPhone(contact({ user_id: 43, phone_number: '79001234567' }), botToken, '42', now), null);
  assert.equal(telegramPhone(contact({ user_id: 42, phone_number: '123' }), botToken, '42', now), null);
  assert.equal(telegramPhone(contact({ user_id: 42 }), botToken, '42', now), null);
  assert.equal(telegramPhone('contact=%7B%7D&hash=00', botToken, '42', now), null);
  assert.equal(telegramPhone(undefined, botToken, '42', now), null);
});

test('accessCode is six digits, stable within a Volgograd day and bound to mentor and secret', () => {
  const day = new Date('2026-11-12T08:00:00Z');
  const code = accessCode('secret', 'mentor-1', day);
  assert.match(code, /^\d{6}$/);
  assert.equal(accessCode('secret', 'mentor-1', new Date('2026-11-12T20:59:59Z')), code);
  // Полночь по Волгограду (UTC+3) наступает в 21:00 UTC.
  assert.notEqual(accessCode('secret', 'mentor-1', new Date('2026-11-12T21:00:00Z')), code);
  assert.notEqual(accessCode('secret', 'mentor-2', day), code);
  assert.notEqual(accessCode('other', 'mentor-1', day), code);
});
