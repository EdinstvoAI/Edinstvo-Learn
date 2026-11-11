import { execFileSync } from 'node:child_process';

const key = process.env.LOCAL_SETUP_TOKEN;
const port = Number(process.env.LEARN_PORT ?? 5188);
if (!/^[0-9a-f]{64}$/.test(key ?? '') || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Configure LOCAL_SETUP_TOKEN and LEARN_PORT in .env.');
}
execFileSync('open', ['http://127.0.0.1:' + port + '/#setup=' + key]);
