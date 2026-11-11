import { defineConfig, loadEnv } from 'vite';
import { makeApi } from './server/api.js';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const api = makeApi(env);
  const connect = (server) => {
    server.middlewares.use('/api', api.middleware);
    server.httpServer?.once('close', () => { void api.close(); });
  };
  return {
    plugins: [{ name: 'learn-api', configureServer: connect, configurePreviewServer: connect }],
    server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**'] } },
    preview: { allowedHosts: env.PUBLIC_ORIGIN ? [new URL(env.PUBLIC_ORIGIN).hostname] : [] },
  };
});
