import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCalendar } from '../server/calendar-import.js';

const calendar = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0',
  ...events.flatMap((event) => ['BEGIN:VEVENT', ...event, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

test('imports mixed calendar dates and folded text into the app time zone', () => {
  const input = calendar(
    ['UID:utc', 'SUMMARY:Встреча', ' МЕНТОРА', 'DTSTART:20261116T090000Z', 'DTEND:20261116T093000Z'],
    ['UID:foreign', 'DTSTART;TZID=America/New_York:20261116T090000', 'DURATION:PT1H'],
    ['UID:all-day', 'DTSTART;VALUE=DATE:20261117', 'DTEND;VALUE=DATE:20261119'],
    ['UID:floating', 'DTSTART:20261116T120000'],
  );
  const rows = parseCalendar(input);
  assert.deepEqual(rows.map(({ startDate, time, endDate, endTime, allDay }) => [startDate, time, endDate, endTime, allDay]), [
    ['2026-11-16','12:00','2026-11-16','12:30',false], ['2026-11-16','17:00','2026-11-16','18:00',false],
    ['2026-11-17','00:00','2026-11-18','23:59',true], ['2026-11-16','12:00','2026-11-16','12:00',false],
  ]);
  assert.equal(rows[0].title, 'встречаментора');
  assert.deepEqual(parseCalendar(input), rows);
});

test('expands recurrences, skips exclusions and canceled events, and retains moved instances', () => {
  const rows = parseCalendar(calendar(
    ['UID:weekly', 'SUMMARY:разбор', 'DTSTART:20261116T090000Z', 'DURATION:PT1H',
      'RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE:20261123T090000Z'],
    ['UID:weekly', 'RECURRENCE-ID:20261130T090000Z', 'DTSTART:20261201T100000Z', 'SUMMARY:перенесённый разбор'],
    ['UID:weekly', 'RECURRENCE-ID:20261207T090000Z', 'STATUS:CANCELLED'],
  ), Date.parse('2026-11-16'));
  assert.deepEqual(rows.map(({ title, startDate }) => [title, startDate]), [['разбор', '2026-11-16'], ['перенесённый разбор', '2026-12-01']]);
  assert.notEqual(rows[0].importKey, rows[1].importKey);
});

test('rejects empty, invalid and oversized imports', () => {
  for (const input of ['hello', calendar(), 'x'.repeat(512 * 1024 + 1)]) {
    assert.throws(() => parseCalendar(input), { status: 422 });
  }
});
