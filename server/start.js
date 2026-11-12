import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeApi } from './api.js';

const env = process.env;
if (env.PUBLIC_ORIGIN) {
  const publicUrl = URL.parse(env.PUBLIC_ORIGIN);
  if (publicUrl?.protocol !== 'https:' || publicUrl.origin !== env.PUBLIC_ORIGIN ||
    !env.TELEGRAM_BOT_TOKEN || !/^\d+$/.test(env.TELEGRAM_MENTOR_ID ?? '')) {
    throw new Error('Set PUBLIC_ORIGIN to an HTTPS origin and configure TELEGRAM_BOT_TOKEN and TELEGRAM_MENTOR_ID.');
  }
}
if (!env.DATABASE_URL || !env.ACCESS_CODE_SECRET) throw new Error('Set DATABASE_URL and ACCESS_CODE_SECRET.');

const api = makeApi(env);
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'], ['.woff2', 'font/woff2'],
]);

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      request.url = url.pathname.slice(4) + url.search;
      return await api.middleware(request, response);
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = resolve(dist, '.' + pathname);
    const type = types.get(extname(file));
    if (!file.startsWith(dist + sep) || !type) {
      response.writeHead(404).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': type, 'Content-Length': info.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    const status = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 500;
    if (!response.headersSent) response.writeHead(status).end();
    else response.destroy();
  }
});

server.listen(5188, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => { void api.close(); }));
}
