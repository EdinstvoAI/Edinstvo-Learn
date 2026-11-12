// Печатает scrypt-хеш для MENTOR_PASSWORD_HASH и MENTOR_PIN_HASH. Значение читается из stdin и не попадает в историю команд.
import { createInterface } from 'node:readline/promises';
import { hashSecret } from './mentor-login.js';

const input = createInterface({ input: process.stdin, output: process.stderr });
const value = (await input.question('Пароль или PIN: ')).trim();
input.close();
if (!value) throw new Error('Пустое значение.');
console.log(hashSecret(value));
