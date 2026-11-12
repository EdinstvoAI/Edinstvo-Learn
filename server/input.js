// Проверка и нормализация входных данных API. Без обращения к базе, чтобы логику можно было тестировать отдельно.
export const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireInput(valid, message = 'Проверь введённые данные.') {
  if (!valid) throw new ApiError(422, message);
}

export function allowed(valid) {
  if (!valid) throw new ApiError(403, 'У этого аккаунта нет доступа.');
}

// Регулярки мало: 2026-02-30 проходит шаблон, но такой даты нет.
export const validDate = (value) => typeof value === 'string' && datePattern.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const validTime = (value) => typeof value === 'string' && timePattern.test(value);
export const lowerText = (value, max) => typeof value === 'string' ? value.trim().toLowerCase().slice(0, max) : '';
export const shortText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

// Начало и конец задачи. Старые клиенты присылают только date и time, тогда задача занимает одну точку.
export function taskSchedule(data) {
  const startDate = data.startDate || data.date;
  const endDate = data.endDate || startDate;
  const time = data.time;
  const endTime = data.endTime || time;
  requireInput(validDate(startDate) && validDate(endDate) && startDate <= endDate &&
    validTime(time) && validTime(endTime) && (startDate < endDate || endTime >= time));
  return { startDate, endDate, time, endTime };
}

function httpsUrl(raw, message, domains) {
  let url;
  try { url = new URL(raw); } catch { throw new ApiError(422, message); }
  requireInput(url.protocol === 'https:' && !url.username && !url.password &&
    (!domains || domains.includes(url.hostname)), message);
  return url.href;
}

// До трёх свободных пар «название + ссылка». Поля github и figma остаются для старых клиентов.
export function projectSources(data) {
  const sources = [];
  const links = Array.isArray(data.links) ? data.links : [];
  for (const item of links.slice(0, 3)) {
    if (!item?.name && !item?.url) continue;
    const type = lowerText(item.name, 70);
    requireInput(type && typeof item.url === 'string', 'Заполни название и ссылку.');
    let url;
    try { url = new URL(item.url); } catch { throw new ApiError(422, 'Проверь ссылку.'); }
    requireInput(url.protocol === 'https:' && !url.username && !url.password, 'Ссылка должна начинаться с https://.');
    sources.push({ type, url: url.href });
  }
  if (sources.length) return sources;
  for (const [type, raw, domains] of [
    ['github', data.github, ['github.com', 'www.github.com']],
    ['figma', data.figma, ['figma.com', 'www.figma.com']],
  ]) {
    if (raw) sources.push({ type, url: httpsUrl(raw, 'Проверь ссылку ' + type + '.', domains) });
  }
  return sources;
}
