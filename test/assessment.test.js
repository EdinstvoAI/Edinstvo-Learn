import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreAssessment } from '../server/assessment.js';
import { questions } from '../src/questions.js';
import { softSkills } from '../src/skills.js';

test('scores every soft skill from three questions', () => {
  const levels = scoreAssessment(Array(30).fill(0));
  assert.equal(levels.length, softSkills.length);
  // Ключ первых трёх вопросов даёт 1 + 2 + 1 балла из 9 за первый вариант.
  assert.equal(levels[0], Math.round(4 / 9 * 100));
  assert.ok(levels.every((level) => Number.isInteger(level) && level >= 0 && level <= 100));
});

test('best answers give 100 and worst give 0 for every skill', () => {
  // Каждая строка ключа содержит баллы 0..3 по одному разу, поэтому лучший и худший вариант находятся перебором.
  const pick = (target) => Array.from({ length: 30 }, (_, question) => [0, 1, 2, 3].find((answer) => {
    const answers = Array(30).fill(0);
    const base = scoreAssessment(answers)[Math.floor(question / 3)];
    answers[question] = answer;
    const others = [0, 1, 2, 3].map((option) => {
      const probe = Array(30).fill(0);
      probe[question] = option;
      return scoreAssessment(probe)[Math.floor(question / 3)];
    });
    return scoreAssessment(answers)[Math.floor(question / 3)] === target(...others) && base !== undefined;
  }));
  assert.deepEqual(scoreAssessment(pick(Math.max)), Array(10).fill(100));
  assert.deepEqual(scoreAssessment(pick(Math.min)), Array(10).fill(0));
});

test('rejects incomplete or malformed answers', () => {
  assert.equal(scoreAssessment(Array(29).fill(0)), null);
  assert.equal(scoreAssessment(Array(31).fill(0)), null);
  assert.equal(scoreAssessment([...Array(29).fill(0), 4]), null);
  assert.equal(scoreAssessment([...Array(29).fill(0), -1]), null);
  assert.equal(scoreAssessment([...Array(29).fill(0), 1.5]), null);
  assert.equal(scoreAssessment([...Array(29).fill(0), '1']), null);
  assert.equal(scoreAssessment('0'.repeat(30)), null);
  assert.equal(scoreAssessment(undefined), null);
});

test('client questions match the server key', () => {
  assert.equal(questions.length, 30);
  for (const question of questions) {
    assert.ok(question.title);
    assert.equal(question.answers.length, 4);
  }
});
