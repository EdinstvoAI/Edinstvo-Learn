const answerKey = [
  [1, 0, 2, 3],
  [2, 0, 3, 1],
  [1, 3, 0, 2],
  [1, 3, 2, 0],
  [2, 1, 3, 0],
  [0, 1, 2, 3],
  [3, 0, 1, 2],
  [3, 0, 1, 2],
  [1, 3, 2, 0],
  [3, 2, 1, 0],
  [3, 1, 2, 0],
  [3, 2, 1, 0],
  [3, 2, 1, 0],
  [3, 2, 0, 1],
  [1, 0, 3, 2],
  [2, 1, 3, 0],
  [3, 1, 2, 0],
  [0, 3, 1, 2],
  [2, 3, 0, 1],
  [0, 1, 2, 3],
  [2, 3, 1, 0],
  [1, 2, 3, 0],
  [3, 0, 1, 2],
  [2, 1, 0, 3],
  [1, 3, 0, 2],
  [2, 3, 1, 0],
  [1, 2, 0, 3],
  [3, 0, 2, 1],
  [1, 0, 3, 2],
  [1, 3, 0, 2],
];

export function scoreAssessment(answers) {
  if (!Array.isArray(answers) || answers.length !== answerKey.length ||
      !answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer <= 3)) {
    return null;
  }

  const totals = Array(10).fill(0);
  for (const [index, answer] of answers.entries()) {
    totals[Math.floor(index / 3)] += answerKey[index][answer];
  }
  return totals.map((score) => Math.round(score / 9 * 100));
}
