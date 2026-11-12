# Карта проекта

- [AGENTS.md](../AGENTS.md) — вход для Codex и других агентов.
- [CLAUDE.md](../CLAUDE.md) — общие правила и маршруты по областям.
- [PRODUCT.md](../PRODUCT.md) — концепция и открытые вопросы.
- [TASKS.md](TASKS.md) — точка продолжения работы.
- [DECISIONS.md](DECISIONS.md) — подтверждённые решения.

- [index.html](../index.html), [src/app.js](../src/app.js), [src/style.css](../src/style.css) — вход, экраны и стили прототипа.
- [src/skill-chart.js](../src/skill-chart.js), [src/celebration.js](../src/celebration.js) — секторный круг и эффекты Lottie.
- [src/student-home.css](../src/student-home.css) — мобильная композиция менти. [src/home-backdrop.js](../src/home-backdrop.js) загружает фон главной, экспорт из Figma лежит в [public/mobile-home](../public/mobile-home).
- [src/questions.js](../src/questions.js), [src/skills.js](../src/skills.js), [server/assessment.js](../server/assessment.js) — вопросы, общий каталог и серверный ключ.
- [src/api.js](../src/api.js), [server/api.js](../server/api.js), [vite.config.js](../vite.config.js) — клиент и маршруты API.
- [server/database.js](../server/database.js), [server/schema.sql](../server/schema.sql), [server/open-local.js](../server/open-local.js) — PostgreSQL, таблицы и вход на Mac.
- [Dockerfile](../Dockerfile), [compose.yaml](../compose.yaml), [.env.example](../.env.example) — контейнеры и имена параметров.
- [package.json](../package.json), [package-lock.json](../package-lock.json) — зависимости и команды прототипа.
- [public/profile-sky.webp](../public/profile-sky.webp), [public/fonts](../public/fonts) — обложка и шрифты.
- [public/edinstvo-wordmark.svg](../public/edinstvo-wordmark.svg), [public/learn-wordmark.svg](../public/learn-wordmark.svg) — экспорт слоёв логотипа из Figma.

- [src/skill-growth.js](../src/skill-growth.js) связывает сцену Lottie с сектором менти, [src/project-folders.js](../src/project-folders.js) задаёт каталог обложек, [server/start.js](../server/start.js) обслуживает сборку и API в Docker.
- [server/input.js](../server/input.js) проверяет входные данные API, [server/telegram.js](../server/telegram.js) проверяет подписи Telegram и считает суточный код. [src/schedule.js](../src/schedule.js) держит даты календаря, фильтры и порядок вариантов теста. Юнит-тесты лежат в [test](../test), запуск `npm test`.
