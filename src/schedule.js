// Даты календаря и порядок теста без DOM, чтобы логику можно было проверить юнит-тестами.
export const parseDate = (date) => new Date(date + 'T12:00:00Z');
export const formatDate = (date) => date.toISOString().slice(0, 10);

const startOf = (task) => task.startDate ?? task.date;
const endOf = (task) => task.endDate ?? task.date;

export const taskOnDay = (task, day) => day >= startOf(task) && day <= endOf(task);

// Понедельник недели, в которую попадает дата.
export function weekStart(date) {
  const monday = parseDate(date);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return formatDate(monday);
}

export function shiftDate(date, days) {
  const next = parseDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDate(next);
}

const newTaskAge = 7 * 24 * 60 * 60 * 1000;

// Фильтры календаря: задачи выбранного дня, созданные за последнюю неделю или все.
export function filterTasks(tasks, filter, day, now = Date.now()) {
  return tasks.filter((task) => {
    if (filter === 'today') return taskOnDay(task, day);
    if (filter === 'new') return Boolean(task.createdAt) && Date.parse(task.createdAt) >= now - newTaskAge;
    return true;
  }).sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.time.localeCompare(b.time));
}

// Ближайшая незавершённая задача: будущая, идущая сейчас многодневная или сегодняшняя, которая ещё не началась.
// Вчерашняя задача с поздним временем сюда не попадает, даже если её время больше текущего.
export function upcomingTask(tasks, day, time) {
  return tasks.find((task) => !task.done && endOf(task) >= day && (startOf(task) !== day || task.time >= time));
}

// Задачи по неделям с понедельника, в порядке появления недель.
export function tasksByWeek(tasks) {
  const weeks = new Map();
  for (const task of tasks) {
    const start = weekStart(task.date);
    if (!weeks.has(start)) weeks.set(start, []);
    weeks.get(start).push(task);
  }
  return [...weeks];
}

// После этих по счёту ответов тест делает паузу с поддержкой.
export const assessmentPauses = [9, 20, 25];

// Порядок вариантов зависит только от номера вопроса: он не меняется при возврате назад
// и перезагрузке, а сервер получает исходный индекс варианта.
export function shuffledAnswers(questionIndex, answers) {
  const order = answers.map((_, index) => index);
  let seed = (questionIndex + 1) * 7919;
  for (let index = order.length - 1; index > 0; index -= 1) {
    seed = (seed * 48271) % 2147483647;
    const swap = seed % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order.map((index) => ({ index, answer: answers[index] }));
}
