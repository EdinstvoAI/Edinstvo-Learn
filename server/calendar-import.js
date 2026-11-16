import { createHash } from 'node:crypto';
import ICAL from 'ical.js';
import { ApiError, lowerText, requireInput, taskSchedule } from './input.js';

const appZone = 'Europe/Volgograd';
const dayMs = 86_400_000;
const maxEvents = 2000;
const fixedZone = formatter(appZone);

function formatter(zone) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

function instant(time, zone, localFormatters) {
  if (time.zone !== ICAL.Timezone.localTimezone) return time.toUnixTime() * 1000;
  const local = Date.parse(time.toString() + 'Z');
  if (!zone) return local;
  if (!localFormatters.has(zone)) localFormatters.set(zone, formatter(zone));
  const source = localFormatters.get(zone);
  const offset = (value) => Date.parse(source.format(value).replace(' ', 'T') + 'Z') - value;
  return local - offset(local - offset(local));
}

function dateAndTime(time, zone, localFormatters) {
  if (!time) throw new Error('missing date');
  const value = time.isDate || (!zone && time.zone === ICAL.Timezone.localTimezone)
    ? time.toString().replace('T', ' ')
    : fixedZone.format(instant(time, zone, localFormatters));
  return [value.slice(0, 10), time.isDate ? '00:00' : value.slice(11, 16)];
}

export function parseCalendar(text, now = Date.now()) {
  requireInput(typeof text === 'string' && Buffer.byteLength(text, 'utf8') <= 512 * 1024,
    'Выбери файл .ics до 512 КБ.');
  const rows = new Map();
  const firstRecurring = new Date(now - 30 * dayMs).toISOString().slice(0, 10);
  const lastRecurring = new Date(now + 365 * dayMs).toISOString().slice(0, 10);
  const localFormatters = new Map();
  let iterations = 0;
  try {
    const calendar = new ICAL.Component(ICAL.parse(text));
    if (calendar.name !== 'vcalendar') throw new Error('invalid calendar');
    const roots = new Map();
    const exceptions = new Map();
    for (const event of calendar.getAllSubcomponents('vevent')) {
      const uid = event.getFirstPropertyValue('uid');
      if (!uid) throw new Error('missing uid');
      if (event.hasProperty('recurrence-id')) {
        if (!exceptions.has(uid)) exceptions.set(uid, []);
        exceptions.get(uid).push(event);
      } else {
        roots.set(uid, event);
      }
    }
    const append = (uid, recurrence, details) => {
      const { item = details, startDate: start, endDate: end } = details;
      if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return;
      const zone = item.component.getFirstProperty('dtstart')?.getParameter('tzid');
      const endZone = item.component.getFirstProperty('dtend')?.getParameter('tzid');
      const [startDate, time] = dateAndTime(start, zone, localFormatters);
      let [endDate, endTime] = dateAndTime(end, endZone ?? (item.component.hasProperty('dtend') ? undefined : zone), localFormatters);
      if (start.isDate && endDate > startDate) {
        endDate = new Date(Date.parse(endDate) - dayMs).toISOString().slice(0, 10);
      }
      if (start.isDate) endTime = '23:59';
      const importKey = createHash('sha256').update(JSON.stringify([uid, recurrence])).digest('hex');
      rows.set(importKey, {
        importKey, title: lowerText(item.summary, 100) || 'событие календаря', allDay: start.isDate,
        ...taskSchedule({ startDate, endDate, time, endTime }),
      });
      requireInput(rows.size <= maxEvents, 'В файле больше 2000 событий.');
    };
    for (const [uid, component] of roots) {
      if (component.getFirstPropertyValue('status') === 'CANCELLED') continue;
      const event = new ICAL.Event(component, { exceptions: exceptions.get(uid) ?? [] });
      if (!event.isRecurring()) {
        append(uid, null, event);
        continue;
      }
      const iterator = event.iterator();
      for (let occurrence = iterator.next(); occurrence; occurrence = iterator.next()) {
        requireInput(++iterations <= 30_000, 'Слишком много повторений для одного импорта.');
        const day = occurrence.toString().slice(0, 10);
        if (day > lastRecurring) break;
        const occurrenceId = occurrence.toString();
        const exception = event.exceptions[occurrenceId]
          ?? event.exceptions[occurrence.convertToZone(ICAL.Timezone.utcTimezone).toString()];
        if (day >= firstRecurring && exception?.component.getFirstPropertyValue('status') !== 'CANCELLED') {
          append(uid, occurrenceId, event.getOccurrenceDetails(occurrence));
        }
      }
    }
    for (const [uid, components] of exceptions) {
      if (roots.has(uid)) continue;
      for (const component of components) {
        const event = new ICAL.Event(component);
        append(uid, event.recurrenceId.toString(), event);
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, 'Не удалось прочитать события из файла .ics. Проверь даты и часовые пояса.');
  }
  requireInput(rows.size, 'В файле нет событий для импорта.');
  return [...rows.values()];
}
