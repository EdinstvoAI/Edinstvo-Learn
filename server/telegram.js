// Подписи Telegram и суточный код доступа. Чистые функции: секреты и время приходят аргументами.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { shortText } from './input.js';

export const hash = (value) => createHash('sha256').update(value).digest('hex');

// Сравниваем хеши, чтобы длина строк не влияла на время сравнения.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
}

// Возвращает проверенные параметры initData или null. Подпись живёт 10 минут.
export function telegramParams(initData, botToken, now = Date.now()) {
  if (!botToken || typeof initData !== 'string' || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const signature = params.get('hash');
  params.delete('hash');
  params.sort();
  const data = [...params].map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(data).digest('hex');
  const age = now / 1000 - Number(params.get('auth_date'));
  if (!safeEqual(signature, expected) || !Number.isFinite(age) || age > 600 || age < -30) return null;
  return params;
}

export function telegramUser(initData, botToken, now = Date.now()) {
  try {
    const user = JSON.parse(telegramParams(initData, botToken, now)?.get('user') ?? 'null');
    if (!user) return null;
    if (!Number.isSafeInteger(user.id) || user.id < 1) return null;
    const name = shortText([user.first_name, user.last_name].filter(Boolean).join(' '), 100);
    let photoUrl = null;
    if (typeof user.photo_url === 'string' && user.photo_url.length <= 2048) {
      const url = URL.parse(user.photo_url);
      if (url?.protocol === 'https:' && !url.username && !url.password) photoUrl = url.href;
    }
    const username = typeof user.username === 'string' && /^[a-zA-Z0-9_]{1,32}$/.test(user.username) ? user.username : null;
    return name ? { id: String(user.id), name, photoUrl, username } : null;
  } catch {
    return null;
  }
}

// Номер из подписанного контакта. Контакт должен принадлежать тому же Telegram ID, что и аккаунт.
export function telegramPhone(contactData, botToken, telegramId, now = Date.now()) {
  let contact;
  try { contact = JSON.parse(telegramParams(contactData, botToken, now)?.get('contact') ?? 'null'); } catch { contact = null; }
  const number = contact?.phone_number;
  if (!contact || String(contact.user_id) !== telegramId || typeof number !== 'string' ||
    !/^\+?[1-9]\d{6,14}$/.test(number)) return null;
  return '+' + number.replace(/^\+/, '');
}

const accessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Volgograd' });

// Шестизначный код ментора на текущие сутки по Волгограду.
export function accessCode(secret, mentorId, date = new Date()) {
  const value = createHmac('sha256', secret).update(mentorId + ':' + accessDay.format(date)).digest();
  return String(value.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}
