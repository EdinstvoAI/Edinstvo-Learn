import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase } from './database.js';
import { scoreAssessment } from './assessment.js';
import { ApiError, allowed, lowerText, projectSources, requireInput, shortText, taskSchedule, uuid } from './input.js';
import { attemptLimiter, mentorCredentialsValid, mentorLoginConfigured } from './mentor-login.js';
import { accessCode as dailyCode, hash, safeEqual, telegramPhone, telegramUser } from './telegram.js';

const folderNames = new Set('grass fur cheese leopard turf chrome gel vinyl terrazzo nylon corduroy foil gingham cactus cloud'.split(' '));
const photoTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const token = () => randomBytes(32).toString('hex');

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

// database можно передать снаружи, чтобы проверять маршруты без PostgreSQL.
export function makeApi(env, database = env.DATABASE_URL ? openDatabase(env.DATABASE_URL) : null) {
  const mentorAttempts = attemptLimiter();
  const allowLocal = Boolean(env.LOCAL_SETUP_TOKEN) && !env.PUBLIC_ORIGIN;
  const cookiePolicy = env.PUBLIC_ORIGIN?.startsWith('https://')
    ? 'SameSite=None; Secure; Partitioned'
    : 'SameSite=Lax';

  async function session(client, response, accountId) {
    const key = token();
    await client.query('INSERT INTO sessions (token_hash, account_id) VALUES ($1, $2)', [hash(key), accountId]);
    response.setHeader('Set-Cookie', 'learn_session=' + key + '; Path=/; HttpOnly; Max-Age=2592000; ' + cookiePolicy);
  }

  async function actorFor(client, request) {
    const key = /(?:^|;\s*)learn_session=([0-9a-f]{64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
    if (!key) return null;
    const result = await client.query(`
      SELECT a.id, a.name, a.role, (a.role = 'mentee' AND a.access_granted_at IS NULL) AS pending FROM sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now()
        AND (NOT $2 OR (a.telegram_id IS NOT NULL AND
          (a.telegram_id = $3 AND a.role = 'mentor' OR a.role = 'mentee' AND EXISTS (
            SELECT 1 FROM accounts m WHERE m.id = a.mentor_id AND m.telegram_id = $3
          ))))`, [hash(key), Boolean(env.PUBLIC_ORIGIN), env.TELEGRAM_MENTOR_ID ?? null]);
    return result.rows[0] ?? null;
  }

  function accessCode(mentorId) {
    if (!env.ACCESS_CODE_SECRET) throw new ApiError(503, 'Код доступа ещё не настроен.');
    return dailyCode(env.ACCESS_CODE_SECRET, mentorId);
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

  async function telegramMentor(client, name = null) {
    const telegramId = env.TELEGRAM_MENTOR_ID;
    const existing = (await client.query("SELECT id FROM accounts WHERE role = 'mentor' AND telegram_id = $1", [telegramId])).rows[0];
    if (existing) {
      if (name) await client.query('UPDATE accounts SET name = $1 WHERE id = $2 AND name <> $1', [name, existing.id]);
      return existing.id;
    }
    const unbound = (await client.query("SELECT id FROM accounts WHERE role = 'mentor' AND telegram_id IS NULL ORDER BY id LIMIT 1")).rows[0];
    if (unbound) {
      await client.query('UPDATE accounts SET telegram_id = $1, name = COALESCE($2, name) WHERE id = $3', [telegramId, name, unbound.id]);
      return unbound.id;
    }
    return (await client.query("INSERT INTO accounts (role, name, telegram_id) VALUES ('mentor', $1, $2) RETURNING id",
      [name ?? 'Ментор', telegramId])).rows[0].id;
  }

  async function createStudent(client, name, telegramId = null, localId = null) {
    const mentorId = telegramId && env.TELEGRAM_MENTOR_ID
      ? await telegramMentor(client)
      : (await client.query("SELECT id FROM accounts WHERE role = 'mentor' ORDER BY id LIMIT 1")).rows[0]?.id;
    if (!mentorId) throw new ApiError(503, 'Кабинет ментора ещё не настроен.');
    return (await client.query(`
      INSERT INTO accounts (role, name, mentor_id, telegram_id, local_id)
      VALUES ('mentee', $1, $2, $3, $4) RETURNING id
    `, [name, mentorId, telegramId, localId])).rows[0].id;
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
      if (route === '/local/student' || route === '/local/join') {
        // /local/join — вход менти с первой страницы в локальном запуске: имя и код без ссылки с токеном.
        allowed(allowLocal && (route === '/local/join' || safeEqual(data.token, env.LOCAL_SETUP_TOKEN)));
        const name = shortText(data.name, 100);
        requireInput(name);
        const localId = hash(name.normalize('NFC').toLowerCase());
        await client.query('SELECT pg_advisory_xact_lock(1348413)');
        const existing = (await client.query('SELECT id FROM accounts WHERE local_id = $1', [localId])).rows[0];
        return existing?.id ?? await createStudent(client, name, null, localId);
      }
      if (route === '/mentor') {
        allowed(mentorLoginConfigured(env));
        if (mentorAttempts.blocked()) throw new ApiError(429, 'Слишком много попыток. Попробуй через несколько минут.');
        if (!mentorCredentialsValid(env, data)) {
          mentorAttempts.fail();
          throw new ApiError(403, 'Данные не подошли.');
        }
        mentorAttempts.reset();
        await client.query('SELECT pg_advisory_xact_lock(1348413)');
        // В публичном окружении сессия ментора привязана к его Telegram ID, поэтому берём тот же аккаунт.
        if (env.TELEGRAM_MENTOR_ID) return telegramMentor(client);
        const existing = (await client.query("SELECT id FROM accounts WHERE role = 'mentor' ORDER BY id LIMIT 1")).rows[0];
        return existing?.id ?? (await client.query("INSERT INTO accounts (role, name) VALUES ('mentor', $1) RETURNING id",
          [shortText(env.LOCAL_MENTOR_NAME, 100) || 'Ментор'])).rows[0].id;
      }
      allowed(Boolean(env.TELEGRAM_BOT_TOKEN));
      const user = telegramUser(data.initData, env.TELEGRAM_BOT_TOKEN);
      allowed(user);
      await client.query('SELECT pg_advisory_xact_lock(1348413)');
      const existing = (await client.query('SELECT id, role FROM accounts WHERE telegram_id = $1', [user.id])).rows[0];
      if (existing) allowed((existing.role === 'mentor') === (user.id === env.TELEGRAM_MENTOR_ID));
      const accountId = user.id === env.TELEGRAM_MENTOR_ID ? await telegramMentor(client, user.name) : existing?.id;
      if (accountId) {
        await client.query(`UPDATE accounts SET telegram_photo_url = $1, telegram_username = $2
          WHERE id = $3 AND (telegram_photo_url, telegram_username) IS DISTINCT FROM ($1, $2)`,
          [user.photoUrl, user.username, accountId]);
        return accountId;
      }
      const id = await createStudent(client, user.name, user.id);
      await client.query('UPDATE accounts SET telegram_photo_url = $1, telegram_username = $2 WHERE id = $3',
        [user.photoUrl, user.username, id]);
      return id;
    });
  }

  async function state(client, actor) {
    if (!actor || actor.pending) return { account: actor, people: [], tasks: [], telegram: Boolean(env.TELEGRAM_BOT_TOKEN), local: allowLocal };
    const { rows } = await client.query(`
      SELECT id, name, profile, access_granted_at, created_at, telegram_photo_url, telegram_username FROM accounts WHERE role = 'mentee' AND (id = $1 OR mentor_id = $1) ORDER BY name
    `, [actor.id]);
    const ids = rows.map((person) => person.id);
    const [tasks, photos] = await Promise.all([
      client.query(`SELECT id, person, title, day::text AS date, COALESCE(start_day, day)::text AS "startDate",
        COALESCE(end_day, day)::text AS "endDate", to_char(time, 'HH24:MI') AS time,
        to_char(COALESCE(end_time, time), 'HH24:MI') AS "endTime", created_at AS "createdAt", movable, done, project_id AS "projectId"
        FROM tasks WHERE person = ANY($1::uuid[]) ORDER BY day, time`, [ids]),
      client.query(`SELECT id, person, caption, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date
        FROM photos WHERE person = ANY($1::uuid[]) ORDER BY created_at DESC`, [ids]),
    ]);
    return {
      account: actor,
      telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
      local: allowLocal,
      people: rows.map(({ id, name, profile: { skillGrowth, ...profile }, access_granted_at, created_at, telegram_photo_url, telegram_username }) => ({
        id, name, pending: !access_granted_at, initials: name.split(/\s+/).slice(0, 2).map((word) => word[0]).join(''),
        createdAt: created_at,
        ...profile, ...(id === actor.id ? { skillGrowth: skillGrowth ?? [] } : {}), photoUrl: telegram_photo_url, username: telegram_username, soft: profile.soft ?? null, hard: profile.hard ?? [], projects: profile.projects ?? [],
        photos: photos.rows.filter((photo) => photo.person === id).map((photo) => ({ ...photo, url: '/api/photo/' + photo.id })),
      })),
      tasks: tasks.rows,
    };
  }

  async function mutate(actor, person, action, data) {
    return database.transaction(async (client) => {
      const row = (await client.query(`
        SELECT profile, telegram_id FROM accounts WHERE role = 'mentee' AND id = $1 AND (id = $2 OR mentor_id = $2) FOR UPDATE
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
      } else if (action === 'telegram-contact') {
        allowed(!mentor && row.telegram_id);
        const phone = telegramPhone(data.contact, env.TELEGRAM_BOT_TOKEN, row.telegram_id);
        requireInput(phone, 'Telegram не подтвердил номер.');
        profile.phone = phone;
      } else if (action === 'layers') {
        allowed(!mentor);
        requireInput(['sky', 'mint', 'violet'].includes(data.cover));
        profile.layers = { cover: data.cover, stickers: data.stickers === true, projects: data.projects === true };
      } else if (action === 'title') {
        // Роль на карточке профиля, например «дизайнер». Её задаёт ментор.
        allowed(mentor);
        const title = lowerText(data.title, 40);
        requireInput(title, 'Укажи роль.');
        profile.title = title;
      } else if (action === 'hard') {
        allowed(mentor);
        const name = lowerText(data.name, 70);
        const skills = Array.isArray(data.skills) ? [...new Set(data.skills.map((item) => lowerText(item, 70)).filter(Boolean))] : [];
        requireInput(name && skills.length > 0 && skills.length <= 10, 'Укажи название и до 10 навыков.');
        profile.hard = [...(profile.hard ?? []), { name, skills, levels: skills.map(() => 0) }];
      } else if (action === 'growth-seen') {
        allowed(!mentor);
        requireInput(typeof data.id === 'string' && uuid.test(data.id));
        profile.skillGrowth = (profile.skillGrowth ?? []).filter((event) => event.id !== data.id);
      } else if (action === 'score') {
        allowed(mentor);
        const { key, index, score } = data;
        requireInput(Number.isInteger(index) && index >= 0 && Number.isInteger(score));
        let from;
        let to;
        let reached = false;
        if (key === 'soft') {
          const reason = lowerText(data.reason, 180);
          requireInput(profile.soft && index < 10 && score >= 1 && score <= 5 && reason);
          profile.mentorScores ??= {};
          const previous = profile.mentorScores[index];
          from = previous ? previous.score * 20 : profile.soft[index];
          to = score * 20;
          const history = previous ? [...(previous.history ?? []), { score: previous.score, reason: previous.reason, updatedAt: previous.updatedAt }] : [];
          profile.mentorScores[index] = { score, reason, updatedAt: new Date().toISOString(), history };
        } else {
          const group = Number.isInteger(key) ? profile.hard?.[key] : null;
          requireInput(group && index < group.levels.length && score >= 0 && score <= 100);
          from = group.levels[index];
          to = score;
          group.levels[index] = score;
          reached = !group.celebrated && group.levels.every((level) => level >= 75);
          group.celebrated ||= reached;
        }
        if (to > from) {
          profile.skillGrowth = [...(profile.skillGrowth ?? []), { id: randomUUID(), key, index, from, to }];
        }
        await client.query('UPDATE accounts SET profile = $1 WHERE id = $2', [profile, person]);
        return { reached };
      } else if (action === 'project-comment') {
        allowed(mentor);
        const project = profile.projects?.find((item) => item.id === data.projectId);
        const text = lowerText(data.text, 1000);
        requireInput(project && text, 'Укажи проект и текст комментария.');
        project.comments = [...(project.comments ?? []), {
          id: randomUUID(), text, author: actor.name, createdAt: new Date().toISOString(),
        }];
      } else if (action === 'project') {
        const name = lowerText(data.name, 80);
        requireInput(name && (!data.folder || folderNames.has(data.folder)));
        profile.projects = [...(profile.projects ?? []), {
          id: randomUUID(), name, folder: data.folder || 'gel', description: lowerText(data.description, 160), sources: projectSources(data),
        }];
      } else if (action === 'photo') {
        allowed(!mentor);
        requireInput(photoTypes.has(data.mime) && typeof data.contents === 'string');
        const contents = Buffer.from(data.contents, 'base64');
        requireInput(contents.length > 0 && contents.length <= 10 * 1024 * 1024, 'Размер фото должен быть до 10 МБ.');
        await client.query('INSERT INTO photos (person, mime, contents, caption) VALUES ($1, $2, $3, $4)',
          [person, data.mime, contents, lowerText(data.caption, 120)]);
        return {};
      } else if (action === 'remove-photo') {
        allowed(!mentor);
        requireInput(typeof data.id === 'string' && uuid.test(data.id));
        await client.query('DELETE FROM photos WHERE id = $1 AND person = $2', [data.id, person]);
        return {};
      } else if (action === 'create-task' || action === 'link-task') {
        const projectId = data.projectId || null;
        requireInput(!projectId || (profile.projects ?? []).some((project) => project.id === projectId),
          'Выбери проект этого ученика.');
        if (action === 'create-task') {
          const title = lowerText(data.title, 100);
          const { startDate, endDate, time, endTime } = taskSchedule(data);
          requireInput(title);
          await client.query('INSERT INTO tasks (person, title, day, start_day, end_day, time, end_time, movable, project_id) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8)',
            [person, title, startDate, endDate, time, endTime, !mentor || data.movable === true, projectId]);
        } else {
          requireInput(typeof data.id === 'string' && uuid.test(data.id));
          const update = await client.query('UPDATE tasks SET project_id = $1 WHERE id = $2 AND person = $3 AND ($4 OR movable)',
            [projectId, data.id, person, mentor]);
          allowed(update.rowCount);
        }
        return {};
      } else if (action === 'move-task') {
        requireInput(typeof data.id === 'string' && uuid.test(data.id));
        const { startDate, endDate, time, endTime } = taskSchedule(data);
        const projectId = data.projectId || null;
        requireInput(!projectId || (profile.projects ?? []).some((project) => project.id === projectId),
          'Выбери проект этого ученика.');
        const update = await client.query(`UPDATE tasks SET day = $1, start_day = $1, end_day = $2, time = $3, end_time = $4,
          project_id = CASE WHEN $7 THEN $8 ELSE project_id END
          WHERE id = $5 AND person = $6 AND NOT done AND ($9 OR movable)`,
          [startDate, endDate, time, endTime, data.id, person, Object.hasOwn(data, 'projectId'), projectId, mentor]);
        allowed(update.rowCount);
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
          allowed(!origin || origin === (env.PUBLIC_ORIGIN || 'http://' + request.headers.host));
          requireInput(request.headers['content-type']?.startsWith('application/json'));
          const data = await bodyOf(request);
          if (['/local', '/local/student', '/local/join', '/telegram', '/mentor'].includes(route)) {
            const accountId = await signIn(route, data);
            if (route === '/local/join') {
              // Код нужен один раз, при первой активации. Сессия появляется только после верного кода.
              const pending = (await client.query('SELECT access_granted_at IS NULL AS pending FROM accounts WHERE id = $1', [accountId])).rows[0].pending;
              if (pending) await unlock({ id: accountId }, data.code);
            }
            await session(client, response, accountId);
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
