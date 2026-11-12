# Развёртывание

1. На сервере с Docker Compose направь DNS поддомена на сервер и открой порты 80 и 443. Caddy получит и будет обновлять сертификат автоматически. [Требования Caddy](https://caddyserver.com/docs/automatic-https#overview)
2. Скопируй `.env.example` в `.env` на сервере. Заполни значения ниже. `LOCAL_SETUP_TOKEN` оставь пустым.

```dotenv
PUBLIC_ORIGIN=https://learn.example.com
TELEGRAM_BOT_TOKEN=
TELEGRAM_MENTOR_ID=
POSTGRES_PASSWORD=
ACCESS_CODE_SECRET=
```

- `TELEGRAM_BOT_TOKEN` выдаёт [@BotFather](https://t.me/BotFather).
- `TELEGRAM_MENTOR_ID` содержит твой числовой Telegram ID. Его можно посмотреть в `message.from.id` после сообщения своему боту через [Bot API getUpdates](https://core.telegram.org/bots/api#getupdates), если у бота ещё нет webhook.
- Для `POSTGRES_PASSWORD` и `ACCESS_CODE_SECRET` дважды запусти `openssl rand -hex 32` и вставь разные результаты. При обновлении существующей БД сохраняй её текущий пароль.

3. Запусти на сервере команды из папки проекта.

```sh
docker compose -f compose.yaml -f compose.prod.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.prod.yaml ps
```

4. В BotFather добавь `PUBLIC_ORIGIN` как URL Mini App или кнопки меню. Открой приложение своим аккаунтом. В «Моём кабинете» появится шестизначный код. [Настройка кнопки меню](https://core.telegram.org/bots/webapps#launching-mini-apps-from-the-menu-button)
5. Попроси менти открыть того же бота и ввести код. Он меняется в полночь по Волгограду и нужен при первой активации аккаунта. Входной тест проходится один раз.

Для обновления образа используй ту же команду `up`. PostgreSQL хранит данные в томе `learn-data`. Для диагностики смотри `docker compose -f compose.yaml -f compose.prod.yaml logs --tail=80 app caddy`.
