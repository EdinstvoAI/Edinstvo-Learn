(async () => {
  for (const asset of ['assessment-objects', 'skill-growth']) {
    void fetch('/motion/' + asset + '.json').catch(() => {});
  }
  const response = await fetch('/api/local/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'лиза', code: '421187' }),
  });
  if (!response.ok) throw new Error('Could not join the local capture fixture');
  await customElements.whenDefined('learn-app');
  const app = document.querySelector('learn-app');
  const style = document.createElement('style');
  style.textContent = '.student-shell[data-page=home] :is(.home-sheet, .screen, .student-home, .home-inner-sheet, .home-person) { width: 100%; }';
  document.head.append(style);
  await app.boot();
  if (app.page === 'assessment') {
    app.assessmentStatus = 'questions';
    app.answers = Array.from({ length: 29 }, (_, index) => index % 4);
  }
  setInterval(() => {
    if (app.page === 'home' && !app.finale && !app.growth) void app.refresh();
  }, 400);
})();
