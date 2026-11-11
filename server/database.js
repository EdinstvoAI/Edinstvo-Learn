import { readFile } from 'node:fs/promises';
import pg from 'pg';

export function openDatabase(connectionString) {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 4000 });
  pool.on('error', (error) => console.error('PostgreSQL:', error.message));
  let initializing;

  async function ready() {
    initializing ??= readFile(new URL('./schema.sql', import.meta.url), 'utf8')
      .then((sql) => pool.query(sql))
      .catch((error) => { initializing = undefined; throw error; });
    await initializing;
    return pool;
  }

  async function transaction(operation) {
    const client = await (await ready()).connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { ready, transaction, close: () => pool.end() };
}
