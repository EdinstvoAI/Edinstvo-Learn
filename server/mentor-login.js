// Скрытый вход ментора из браузера: почта, пароль и PIN. В окружении лежат только scrypt-хеши.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { safeEqual } from './telegram.js';

export function hashSecret(value, salt = randomBytes(16)) {
  return salt.toString('hex') + ':' + scryptSync(value.normalize('NFC'), salt, 32).toString('hex');
}

export function verifySecret(value, stored) {
  const [salt, expected] = typeof stored === 'string' ? stored.split(':') : [];
  if (typeof value !== 'string' || !value || value.length > 200 || !/^[0-9a-f]{32}$/.test(salt ?? '') || !/^[0-9a-f]{64}$/.test(expected ?? '')) return false;
  return timingSafeEqual(scryptSync(value.normalize('NFC'), Buffer.from(salt, 'hex'), 32), Buffer.from(expected, 'hex'));
}

export const mentorLoginConfigured = (env) => Boolean(env.MENTOR_EMAIL && env.MENTOR_PASSWORD_HASH && env.MENTOR_PIN_HASH);

// Проверяем все три значения всегда, чтобы ответ не подсказывал, какое из них неверное.
export function mentorCredentialsValid(env, data) {
  const email = typeof data.email === 'string' && safeEqual(data.email.trim().toLowerCase(), env.MENTOR_EMAIL.trim().toLowerCase());
  const password = verifySecret(data.password, env.MENTOR_PASSWORD_HASH);
  const pin = typeof data.pin === 'string' && /^\d{4,8}$/.test(data.pin) && verifySecret(data.pin, env.MENTOR_PIN_HASH);
  return email && password && pin;
}

// Общий счётчик неудач: ментор один, поэтому перебор ограничиваем на весь вход, а не по адресу.
export function attemptLimiter(max = 5, windowMs = 10 * 60 * 1000) {
  let failures = [];
  return {
    blocked(now = Date.now()) {
      failures = failures.filter((time) => now - time < windowMs);
      return failures.length >= max;
    },
    fail(now = Date.now()) { failures.push(now); },
    reset() { failures = []; },
  };
}
