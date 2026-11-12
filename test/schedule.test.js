import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessmentPauses, filterTasks, formatDate, parseDate, shiftDate, shuffledAnswers, taskOnDay, tasksByWeek, upcomingTask, weekStart,
} from '../src/schedule.js';
import { questions } from '../src/questions.js';

const task = (id, date, time, extra = {}) => ({ id, date, time, ...extra });

test('date helpers round-trip and shift across months', () => {
  assert.equal(formatDate(parseDate('2026-11-12')), '2026-11-12');
  assert.equal(shiftDate('2026-11-28', 7), '2026-12-05');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('weekStart returns the Monday of the week', () => {
  assert.equal(weekStart('2026-11-12'), '2026-11-09');
  assert.equal(weekStart('2026-11-09'), '2026-11-09');
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
});

test('taskOnDay covers the whole range and legacy single-day tasks', () => {
  const ranged = task('a', '2026-11-10', '10:00', { startDate: '2026-11-10', endDate: '2026-11-12' });
  assert.equal(taskOnDay(ranged, '2026-11-09'), false);
  assert.equal(taskOnDay(ranged, '2026-11-10'), true);
  assert.equal(taskOnDay(ranged, '2026-11-12'), true);
  assert.equal(taskOnDay(ranged, '2026-11-13'), false);
  assert.equal(taskOnDay(task('b', '2026-11-10', '10:00'), '2026-11-10'), true);
});

test('filterTasks applies today, new and all filters in start order', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const tasks = [
    task('late', '2026-11-12', '18:00', { createdAt: '2026-11-01T10:00:00Z' }),
    task('early', '2026-11-12', '09:00', { createdAt: '2026-11-11T10:00:00Z' }),
    task('range', '2026-11-10', '12:00', { startDate: '2026-11-10', endDate: '2026-11-13', createdAt: '2026-11-05T12:00:00Z' }),
    task('other', '2026-11-20', '12:00'),
  ];
  const ids = (filter) => filterTasks(tasks, filter, '2026-11-12', now).map((item) => item.id);
  assert.deepEqual(ids('today'), ['range', 'early', 'late']);
  assert.deepEqual(ids('new'), ['range', 'early']);
  assert.deepEqual(ids('all'), ['range', 'early', 'late', 'other']);
  assert.deepEqual(filterTasks([], 'today', '2026-11-12', now), []);
  assert.equal(tasks[0].id, 'late', 'input order is left untouched');
});

test('upcomingTask skips done and past tasks', () => {
  const tasks = [
    task('done', '2026-11-12', '20:00', { done: true }),
    task('past', '2026-11-12', '08:00'),
    task('yesterday', '2026-11-11', '23:00'),
    task('next', '2026-11-12', '19:00'),
    task('later', '2026-11-14', '10:00'),
  ];
  assert.equal(upcomingTask(tasks, '2026-11-12', '12:00').id, 'next');
  assert.equal(upcomingTask(tasks, '2026-11-12', '19:30').id, 'later');
  assert.equal(upcomingTask(tasks, '2026-11-15', '00:00'), undefined);
  const ongoing = task('ongoing', '2026-11-10', '09:00', { startDate: '2026-11-10', endDate: '2026-11-13' });
  assert.equal(upcomingTask([ongoing, ...tasks], '2026-11-12', '12:00').id, 'ongoing');
});

test('tasksByWeek groups from Monday to Sunday', () => {
  const weeks = tasksByWeek([
    task('a', '2026-11-09', '10:00'), task('b', '2026-11-15', '10:00'), task('c', '2026-11-16', '10:00'),
  ]);
  assert.deepEqual(weeks.map(([start, items]) => [start, items.map((item) => item.id)]),
    [['2026-11-09', ['a', 'b']], ['2026-11-16', ['c']]]);
});

test('shuffledAnswers is a stable permutation that keeps original indexes', () => {
  let moved = 0;
  for (const [number, question] of questions.entries()) {
    const shuffled = shuffledAnswers(number, question.answers);
    assert.deepEqual(shuffled, shuffledAnswers(number, question.answers));
    assert.deepEqual(shuffled.map((item) => item.index).sort(), [0, 1, 2, 3]);
    for (const item of shuffled) assert.equal(item.answer, question.answers[item.index]);
    if (shuffled.some((item, position) => item.index !== position)) moved += 1;
  }
  assert.ok(moved > 20, 'most questions change the order of answers');
});

test('assessment pauses stay inside the test', () => {
  assert.deepEqual(assessmentPauses, [9, 20, 25]);
  assert.ok(assessmentPauses.every((count) => count > 0 && count < questions.length));
});
