import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { openDatabase } from './database.js';
import { scoreAssessment } from './assessment.js';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const photoTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const token = () => randomBytes(32).toString('hex');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const validDate = (value) => typeof value === 'string' && datePattern.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const shortText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireInput(valid, message = 'Проверь введённые данные.') {
  if (!valid) throw new ApiError(422, message);
}

function allowed(valid) {
  if (!valid) throw new ApiError(403, 'У этого аккаунта нет доступа.');
}

async function bodyOf(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 14 * 1024 * 1024) throw new ApiError(413, 'Файл слишком большой.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new ApiError(400, 'Некорректный запрос.');
  }
}

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
}

function telegramUser(initData, botToken) {
  if (typeof initData !== 'string' || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const signature = params.get('hash');
  params.delete('hash');
  params.sort();
  const data = [...params].map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(data).digest('hex');
  const age = Date.now() / 1000 - Number(params.get('auth_date'));
  if (!safeEqual(signature, expected) || !Number.isFinite(age) || age > 600 || age < -30) return null;
  try {
    const user = JSON.parse(params.get('user'));
    if (!Number.isSafeInteger(user.id) || user.id < 1) return null;
    const name = shortText([user.first_name, user.last_name].filter(Boolean).join(' '), 100);
    return name ? { id: String(user.id), name } : null;
  } catch {
    return null;
  }
}

export function makeApi(env) {
  const database = env.DATABASE_URL ? openDatabase(env.DATABASE_URL) : null;
  const allowLocal = Boolean(env.LOCAL_SETUP_TOKEN) && !env.PUBLIC_ORIGIN;
  const secureCookie = env.PUBLIC_ORIGIN?.startsWith('https://') ? '; Secure' : '';

  async function session(client, response, accountId) {
    const key = token();
    await client.query('INSERT INTO sessions (token_hash, account_id) VALUES ($1, $2)', [hash(key), accountId]);
    response.setHeader('Set-Cookie', 'learn_session=' + key + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' + secureCookie);
  }

  async function actorFor(client, request) {
    const key = /(?:^|;\s*)learn_session=([0-9a-f]{64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
    if (!key) return null;
    const result = await client.query(`
      SELECT a.id, a.name, a.role, (a.role = 'mentee' AND a.access_granted_at IS NULL) AS pending FROM sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [hash(key)]);
    return result.rows[0] ?? null;
  }

  const accessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Volgograd' });

  function accessCode(mentorId) {
    if (!env.ACCESS_CODE_SECRET) throw new ApiError(503, 'Код доступа ещё не настроен.');
    const day = accessDay.format(new Date());
    const value = createHmac('sha256', env.ACCESS_CODE_SECRET).update(mentorId + ':' + day).digest();
    return String(value.readUInt32BE(0) % 1_000_000).padStart(6, '0');
  }

  async function unlock(actor, code) {
    requireInput(typeof code === 'string' && /^\d{6}$/.test(code), 'Введи шесть цифр.');
    const result = await database.transaction(async (client) => {
      const row = (await client.query(`
        SELECT mentor_id, access_granted_at, access_attempts, access_retry_at
        FROM accounts WHERE id = $1 FOR UPDATE`, [actor.id])).rows[0];
      if (row.access_granted_at) return 'ok';
      const inWindow = row.access_retry_at?.getTime() > Date.now();
      if (inWindow && row.access_attempts >= 5) return 'limit';
      if (!safeEqual(code, accessCode(row.mentor_id))) {
        await client.query(`UPDATE accounts SET access_attempts = $2,
          access_retry_at = CASE WHEN $3 THEN access_retry_at ELSE now() + interval '10 minutes' END
          WHERE id = $1`, [actor.id, inWindow ? row.access_attempts + 1 : 1, Boolean(inWindow)]);
        return 'invalid';
      }
      await client.query('UPDATE accounts SET access_granted_at = now(), access_attempts = 0, access_retry_at = NULL WHERE id = $1', [actor.id]);
      return 'ok';
    });
    if (result === 'limit') throw new ApiError(429, 'Слишком много попыток. Попробуй через несколько минут.');
    if (result === 'invalid') throw new ApiError(422, 'Код не подошёл. Проверь сегодняшний код.');
  }

  async function createStudent(client, name, telegramId = null, localId = null) {
    const mentor = (await client.query(`SELECT id FROM accounts WHERE role = 'mentor'
      ORDER BY (telegram_id = $1) DESC NULLS LAST, id LIMIT 1`, [env.TELEGRAM_MENTOR_ID || null])).rows[0];
    if (!mentor) throw new ApiError(503, 'Кабинет ментора ещё не настроен.');
    return (await client.query(`
      INSERT INTO accounts (role, name, mentor_id, telegram_id, local_id)
      VALUES ('mentee', $1, $2, $3, $4) RETURNING id
    `, [name, mentor.id, telegramId, localId])).rows[0].id;
  }

  async function signIn(route, data) {
    return database.transaction(async (client) => {
      if (route === '/local') {
        allowed(allowLocal && safeEqual(data.token, env.LOCAL_SETUP_TOKEN));
        await client.query('SELECT pg_advisory_xact_lock(1348413)');
        const existing = (await client.query("SELECT id FROM accounts WHERE role = 'mentor' ORDER BY id LIMIT 1")).rows[0];
        if (existing) return existing.id;
        const name = shortText(env.LOCAL_MENTOR_NAME, 100);
        requireInput(name, 'Укажи LOCAL_MENTOR_NAME для локального аккаунта.');
        return (await client.query("INSERT INTO accounts (role, name) VALUES ('mentor', $1) RETURNING id", [name])).rows[0].id;
      }
      if (route === '/local/student') {
        allowed(allowLocal && safeEqual(data.token, env.LOCAL_SETUP_TOKEN));
        const name = shortText(data.name, 100);
        requireInput(name);
        const localId = hash(name.normalize('NFC').toLowerCase());
        await client.query('SELECT pg_advisory_xact_lock(1348413)');
        const existing = (await client.query('SELECT id FROM accounts WHERE local_id = $1', [localId])).rows[0];
        return existing?.id ?? await createStudent(client, name, null, localId);
      }
      allowed(Boolean(env.TELEGRAM_BOT_TOKEN));
      const user = telegramUser(data.initData, env.TELEGRAM_BOT_TOKEN);
      allowed(user);
      await client.query('SELECT pg_advisory_xact_lock(1348413)');
      const existing = (await client.query('SELECT id FROM accounts WHERE telegram_id = $1', [user.id])).rows[0];
      if (existing) return existing.id;
      if (user.id === env.TELEGRAM_MENTOR_ID) {
        const mentor = (await client.query("SELECT id FROM accounts WHERE role = 'mentor' AND telegram_id IS NULL LIMIT 1")).rows[0];
        if (mentor) {
          await client.query('UPDATE accounts SET telegram_id = $1 WHERE id = $2', [user.id, mentor.id]);
          return mentor.id;
        }
        return (await client.query("INSERT INTO accounts (role, name, telegram_id) VALUES ('mentor', $1, $2) RETURNING id", [user.name, user.id])).rows[0].id;
      }
      return createStudent(client, user.name, user.id);
    });
  }

  async function state(client, actor) {
    if (!actor || actor.pending) return { account: actor, people: [], tasks: [], telegram: Boolean(env.TELEGRAM_BOT_TOKEN) };
    const { rows } = await client.query(`
      SELECT id, name, profile, access_granted_at FROM accounts WHERE role = 'mentee' AND (id = $1 OR mentor_id = $1) ORDER BY name
    `, [actor.id]);
    const ids = rows.map((person) => person.id);
    const [tasks, photos] = await Promise.all([
      client.query(`SELECT id, person, title, day::text AS date, to_char(time, 'HH24:MI') AS time, movable, done
        FROM tasks WHERE person = ANY($1::uuid[]) ORDER BY day, time`, [ids]),
      client.query(`SELECT id, person, caption, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date
        FROM photos WHERE person = ANY($1::uuid[]) ORDER BY created_at DESC`, [ids]),
    ]);
    return {
      account: actor,
      telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
      people: rows.map(({ id, name, profile, access_granted_at }) => ({
        id, name, pending: !access_granted_at, initials: name.split(/\s+/).slice(0, 2).map((word) => word[0]).join(''),
        ...profile, soft: profile.soft ?? null, hard: profile.hard ?? [], projects: profile.projects ?? [],
        photos: photos.rows.filter((photo) => photo.person === id).map((photo) => ({ ...photo, url: '/api/photo/' + photo.id })),
      })),
      tasks: tasks.rows,
    };
  }

  function projectSources(data) {
    const sources = [];
    for (const [type, raw, domains] of [
      ['GitHub', data.github, ['github.com', 'www.github.com']],
      ['Figma', data.figma, ['figma.com', 'www.figma.com']],
    ]) {
      if (!raw) continue;
      let url;
      try { url = new URL(raw); } catch { throw new ApiError(422, 'Проверь ссылку ' + type + '.'); }
      requireInput(url.protocol === 'https:' && domains.includes(url.hostname) && !url.username && !url.password,
        'Проверь ссылку ' + type + '.');
      sources.push({ type, url: url.href });
    }
    requireInput(sources.length, 'Добавь ссылку на GitHub или Figma.');
    return sources;
  }

  async function mutate(actor, person, action, data) {
    return database.transaction(async (client) => {
      const row = (await client.query(`
        SELECT profile FROM accounts WHERE role = 'mentee' AND id = $1 AND (id = $2 OR mentor_id = $2) FOR UPDATE
      `, [person, actor.id])).rows[0];
      allowed(row);
      const profile = row.profile;
      const mentor = actor.role === 'mentor';
      if (action === 'assessment') {
        allowed(!mentor);
        if (profile.soft) throw new ApiError(409, 'Входной тест уже пройден.');
        const levels = scoreAssessment(data.answers);
        requireInput(levels, 'Ответь на все вопросы.');
        profile.soft = levels;
      } else if (action === 'layers') {
        allowed(!mentor);
        requireInput(['sky', 'mint', 'violet'].includes(data.cover));
        profile.layers = { cover: data.cover, stickers: data.stickers === true, projects: data.projects === true };
      } else if (action === 'hard') {
        allowed(mentor);
        const name = shortText(data.name, 70);
        const skills = Array.isArray(data.skills) ? [...new Set(data.skills.map((item) => shortText(item, 70)).filter(Boolean))] : [];
        requireInput(name && skills.length > 0 && skills.length <= 10, 'Укажи название и до 10 навыков.');
        profile.hard = [...(profile.hard ?? []), { name, skills, levels: skills.map(() => 0) }];
      } else if (action === 'score') {
        allowed(mentor);
        const { key, index, score } = data;
        requireInput(Number.isInteger(index) && index >= 0 && Number.isInteger(score));
        if (key === 'soft') {
          const reason = shortText(data.reason, 180);
          requireInput(profile.soft && index < 10 && score >= 1 && score <= 5 && reason);
          profile.mentorScores ??= {};
          const previous = profile.mentorScores[index];
          const history = previous ? [...(previous.history ?? []), { score: previous.score, reason: previous.reason, updatedAt: previous.updatedAt }] : [];
          profile.mentorScores[index] = { score, reason, updatedAt: new Date().toISOString(), history };
        } else {
          const group = Number.isInteger(key) ? profile.hard?.[key] : null;
          requireInput(group && index < group.levels.length && score >= 0 && score <= 100);
          group.levels[index] = score;
          const reached = !group.celebrated && group.levels.every((level) => level >= 75);
          group.celebrated ||= reached;
          await client.query('UPDATE accounts SET profile = $1 WHERE id = $2', [profile, person]);
          return { reached };
        }
      } else if (action === 'project') {
        allowed(mentor);
        const name = shortText(data.name, 80);
        requireInput(name);
        profile.projects = [...(profile.projects ?? []), {
          name, description: shortText(data.description, 160), sources: projectSources(data),
        }];
      } else if (action === 'photo') {
        allowed(!mentor);
        requireInput(photoTypes.has(data.mime) && typeof data.contents === 'string');
        const contents = Buffer.from(data.contents, 'base64');
        requireInput(contents.length > 0 && contents.length <= 10 * 1024 * 1024, 'Размер фото должен быть до 10 МБ.');
        await client.query('INSERT INTO photos (person, mime, contents, caption) VALUES ($1, $2, $3, $4)',
          [person, data.mime, contents, shortText(data.caption, 120)]);
        return {};
      } else if (action === 'remove-photo') {
        allowed(!mentor);
        requireInput(typeof data.id === 'string' && uuid.test(data.id));
        await client.query('DELETE FROM photos WHERE id = $1 AND person = $2', [data.id, person]);
        return {};
      } else if (action === 'create-task' || action === 'move-task') {
        requireInput(validDate(data.date) && timePattern.test(data.time));
        if (action === 'create-task') {
          allowed(mentor);
          const title = shortText(data.title, 100);
          requireInput(title);
          await client.query('INSERT INTO tasks (person, title, day, time, movable) VALUES ($1, $2, $3, $4, $5)',
            [person, title, data.date, data.time, data.movable === true]);
        } else {
          requireInput(typeof data.id === 'string' && uuid.test(data.id));
          const update = await client.query('UPDATE tasks SET day = $1, time = $2 WHERE id = $3 AND person = $4 AND NOT done AND ($5 OR movable)',
            [data.date, data.time, data.id, person, mentor]);
          allowed(update.rowCount);
        }
        return {};
      } else {
        throw new ApiError(404, 'Действие не найдено.');
      }
      await client.query('UPDATE accounts SET profile = $1 WHERE id = $2', [profile, person]);
      return {};
    });
  }

  return {
    close: () => database?.close(),
    async middleware(request, response) {
      try {
        if (!database) throw new ApiError(503, 'Подключи PostgreSQL.');
        const route = new URL(request.url, 'http://localhost').pathname;
        const client = await database.ready();
        const actor = await actorFor(client, request);
        if (request.method === 'GET' && route === '/state') {
          json(response, 200, await state(client, actor));
          return;
        }
        if (request.method === 'GET' && route === '/access-code') {
          allowed(actor?.role === 'mentor');
          json(response, 200, { code: accessCode(actor.id) });
          return;
        }
        if (request.method === 'POST') {
          const origin = request.headers.origin;
          allowed(!origin || origin === env.PUBLIC_ORIGIN || origin === 'http://' + request.headers.host);
          requireInput(request.headers['content-type']?.startsWith('application/json'));
          const data = await bodyOf(request);
          if (['/local', '/local/student', '/telegram'].includes(route)) {
            await session(client, response, await signIn(route, data));
            json(response, 200, await state(client, await actorFor(client, {
              headers: { cookie: response.getHeader('Set-Cookie').split(';')[0] },
            })));
            return;
          }
          allowed(actor);
          if (route === '/activate') {
            allowed(actor.role === 'mentee');
            await unlock(actor, data.code);
            json(response, 200, await state(client, { ...actor, pending: false }));
            return;
          }
          allowed(!actor.pending);
          const match = /^\/people\/([^/]+)\/([^/]+)$/.exec(route);
          if (match && uuid.test(match[1])) {
            json(response, 200, await mutate(actor, match[1], match[2], data));
            return;
          }
        }
        const picture = /^\/photo\/([^/]+)$/.exec(route);
        if (request.method === 'GET' && picture && uuid.test(picture[1])) {
          allowed(actor && !actor.pending);
          const row = (await client.query(`
            SELECT mime, contents FROM photos p JOIN accounts a ON a.id = p.person
            WHERE p.id = $1 AND (a.id = $2 OR a.mentor_id = $2)`, [picture[1], actor.id])).rows[0];
          if (!row) throw new ApiError(404, 'Фото не найдено.');
          response.writeHead(200, { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
          response.end(row.contents);
          return;
        }
        throw new ApiError(404, 'Маршрут не найден.');
      } catch (error) {
        if (error instanceof ApiError) {
          json(response, error.status, { error: error.message });
        } else {
          console.error('Learn API:', error.message);
          json(response, 503, { error: 'Сервис временно недоступен.' });
        }
      }
    },
  };
}
