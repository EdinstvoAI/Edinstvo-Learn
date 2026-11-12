import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, allowed, lowerText, projectSources, requireInput, shortText, taskSchedule, uuid, validDate, validTime } from '../server/input.js';

const rejects = (run, status) => assert.throws(run, (error) => error instanceof ApiError && error.status === status);

test('requireInput and allowed map to 422 and 403', () => {
  requireInput(true);
  allowed(true);
  rejects(() => requireInput(false), 422);
  rejects(() => allowed(null), 403);
});

test('validDate accepts only real calendar dates', () => {
  assert.equal(validDate('2026-11-12'), true);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-13-01'), false);
  assert.equal(validDate('2026-1-01'), false);
  assert.equal(validDate('2026-11-12T10:00'), false);
  assert.equal(validDate(20261112), false);
  assert.equal(validDate(undefined), false);
});

test('validTime accepts HH:MM within a day', () => {
  assert.equal(validTime('00:00'), true);
  assert.equal(validTime('23:59'), true);
  assert.equal(validTime('24:00'), false);
  assert.equal(validTime('9:00'), false);
  assert.equal(validTime('12:60'), false);
  assert.equal(validTime(undefined), false);
});

test('text helpers trim, cut and lower-case', () => {
  assert.equal(lowerText('  ПрИвет  ', 4), 'прив');
  assert.equal(shortText('  Макар  ', 100), 'Макар');
  assert.equal(lowerText(42, 10), '');
  assert.equal(shortText(null, 10), '');
});

test('uuid pattern', () => {
  assert.ok(uuid.test('3f2b8c1e-7a4d-4e9b-9c1f-0a1b2c3d4e5f'));
  assert.ok(!uuid.test('3f2b8c1e7a4d4e9b9c1f0a1b2c3d4e5f'));
  assert.ok(!uuid.test("3f2b8c1e-7a4d-4e9b-9c1f-0a1b2c3d4e5f' OR 1=1"));
});

test('taskSchedule fills the end from the start', () => {
  assert.deepEqual(taskSchedule({ date: '2026-11-12', time: '18:00' }),
    { startDate: '2026-11-12', endDate: '2026-11-12', time: '18:00', endTime: '18:00' });
  assert.deepEqual(taskSchedule({ startDate: '2026-11-12', endDate: '2026-11-14', time: '18:00', endTime: '09:00' }),
    { startDate: '2026-11-12', endDate: '2026-11-14', time: '18:00', endTime: '09:00' });
});

test('taskSchedule rejects reversed ranges and bad values', () => {
  rejects(() => taskSchedule({ startDate: '2026-11-14', endDate: '2026-11-12', time: '18:00' }), 422);
  rejects(() => taskSchedule({ date: '2026-11-12', time: '18:00', endTime: '17:00' }), 422);
  rejects(() => taskSchedule({ date: '2026-02-30', time: '18:00' }), 422);
  rejects(() => taskSchedule({ date: '2026-11-12' }), 422);
  rejects(() => taskSchedule({ date: '2026-11-12', time: '25:00' }), 422);
  rejects(() => taskSchedule({}), 422);
});

test('projectSources keeps up to three named https links', () => {
  const links = [
    { name: ' Репозиторий ', url: 'https://GitHub.com/Org/Repo' },
    { name: '', url: '' },
    { name: 'макет', url: 'https://example.com/a' },
    { name: 'лишняя', url: 'https://example.com/b' },
  ];
  assert.deepEqual(projectSources({ links }), [
    { type: 'репозиторий', url: 'https://github.com/Org/Repo' },
    { type: 'макет', url: 'https://example.com/a' },
  ]);
});

test('projectSources rejects unsafe or incomplete links', () => {
  rejects(() => projectSources({ links: [{ name: 'a', url: 'http://example.com' }] }), 422);
  rejects(() => projectSources({ links: [{ name: 'a', url: 'javascript:alert(1)' }] }), 422);
  rejects(() => projectSources({ links: [{ name: 'a', url: 'https://user:pass@example.com' }] }), 422);
  rejects(() => projectSources({ links: [{ name: 'a', url: 'not a url' }] }), 422);
  rejects(() => projectSources({ links: [{ name: '', url: 'https://example.com' }] }), 422);
  rejects(() => projectSources({ links: [{ name: 'a' }] }), 422);
});

test('projectSources supports legacy github and figma fields', () => {
  assert.deepEqual(projectSources({ github: 'https://github.com/org/repo', figma: 'https://www.figma.com/file/x' }), [
    { type: 'github', url: 'https://github.com/org/repo' },
    { type: 'figma', url: 'https://www.figma.com/file/x' },
  ]);
  assert.deepEqual(projectSources({}), []);
  rejects(() => projectSources({ github: 'https://github.com.evil.example/org' }), 422);
  rejects(() => projectSources({ figma: 'http://figma.com/file/x' }), 422);
});
