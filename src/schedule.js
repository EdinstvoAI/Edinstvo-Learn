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

export function shiftMonth(day, months) {
  const date = parseDate(day);
  const targetDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  const lastDay = parseDate(formatDate(date));
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(targetDay, lastDay.getUTCDate()));
  return formatDate(date);
}

export function monthGrid(day) {
  const first = day.slice(0, 7) + '-01';
  const start = weekStart(first);
  const next = shiftMonth(first, 1);
  const days = [];
  for (let date = start; date < next || days.length % 7; date = shiftDate(date, 1)) {
    days.push(date);
  }
  return days;
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

// Роудмап проекта на месяц: недели с понедельника, которые пересекают месяц, и задачи каждой недели.
// Многодневная задача попадает в неделю, где она начинается, или в первую неделю месяца, если началась раньше.
export function monthRoadmap(tasks, day, currentDay) {
  const first = day.slice(0, 7) + '-01';
  const next = shiftMonth(first, 1);
  const last = shiftDate(next, -1);
  const inMonth = tasks.filter((task) => startOf(task) <= last && endOf(task) >= first)
    .sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.time.localeCompare(b.time));
  const ranges = [];
  for (let start = weekStart(first); start <= last; start = shiftDate(start, 7)) {
    const end = shiftDate(start, 6);
    ranges.push([start < first ? first : start, end > last ? last : end]);
  }
  // Обрывки недель короче четырёх дней на краях месяца присоединяем к соседней неделе.
  const length = ([from, to]) => (parseDate(to) - parseDate(from)) / 864e5 + 1;
  if (ranges.length > 1 && length(ranges[0]) < 4) ranges.splice(0, 2, [ranges[0][0], ranges[1][1]]);
  if (ranges.length > 1 && length(ranges.at(-1)) < 4) ranges.splice(-2, 2, [ranges.at(-2)[0], ranges.at(-1)[1]]);
  const weeks = [];
  for (const [from, to] of ranges) {
    weeks.push({
      index: weeks.length + 1, start: from, end: to,
      state: currentDay > to ? 'past' : currentDay < from ? 'future' : 'current',
      tasks: inMonth.filter((task) => {
        const anchor = startOf(task) < first ? first : startOf(task);
        return anchor >= from && anchor <= to;
      }),
    });
  }
  const passed = inMonth.filter((task) => task.done || endOf(task) < currentDay).length;
  const days = Number(last.slice(8));
  const elapsed = currentDay < first ? 0 : currentDay > last ? days : Number(currentDay.slice(8));
  const busyDays = [...new Set(inMonth.flatMap((task) => {
    const result = [];
    for (let date = startOf(task) < first ? first : startOf(task); date <= endOf(task) && date <= last; date = shiftDate(date, 1)) {
      result.push(Number(date.slice(8)));
    }
    return result;
  }))].sort((a, b) => a - b);
  return { first, last, days, elapsed, weeks, total: inMonth.length, passed, busyDays };
}
