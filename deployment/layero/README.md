# Layero: статический сайт и API-прокси VPS

Основной адрес — <https://syncli-main.layero.app/>; кабинет — `/doctor/`. `layero.json` задаёт fullstack: весь корневой `dist/` остаётся статикой, только `/api` попадает в отдельный Node.js 24 runtime. API, PostgreSQL, cookie-аутентификация и клиническая логика остаются на VPS. Android продолжает обращаться напрямую к VPS.

Контур уже опубликован. [Поставка API/VPS 27 октября](../../docs/verification/2026-10-27-vps-integration.md) и [публичный обмен с установленным APK 0.4.4 через VPS и Layero](../../docs/verification/2026-10-27-doctor-integration-polish.md) описывают выполненные проверки. Текущие исходники Android — 0.4.5, versionCode 9; версия клиента не меняет ID установленного API `20261027-integration-90ee18d`. [Текущий статус](../../docs/status.md), [проверка работы стенда 29 октября](../../docs/verification/2026-10-29-repository-state.md).

## Настройка существующего проекта

1. Сохранить подключённый GitHub-репозиторий и production-ветку main. Папка проекта — корень репозитория.
2. Применить fullstack из `layero.json`: frontend root `.`, generic, установка `npm ci --ignore-scripts`, сборка `npm run build`, результат `dist`, Node 24. Backend root `deployment/layero`, runtime `node_web`, Node 24, установка `node --version`, запуск `node server.mjs`, порт 3000. Сервер использует `$PORT` и слушает `0.0.0.0`.
3. Проверить в настройках проекта, что backend действительно `node_web`: согласно документации Layero, поле `backend.runtime` само по себе не заменяет настройку проекта.
4. Сначала проверить preview ветки. Для его POST-запросов добавить точный HTTPS origin preview в `SYNCLI_WEB_ORIGINS`. Не использовать wildcard для всех проектов layero.app.
5. После принятия PR задеплоить main обычным способом. Новый проект, домен и ручная загрузка вместо Git-автодеплоя не требуются.

История настройки 26 октября: CLI 0.11.16 не был авторизован; через него выполнен только dry-run. Затем через интерфейс существующего проекта проверены main, включённый автодеплой и fullstack-конфигурация, сохранён `SYNCLI_API_UPSTREAM`. Деплой main `38fca47` опубликован; `/api/health` вернул готовность PostgreSQL и ожидаемую версию API. Браузерная загрузка карт выявила ошибку сжатия, впоследствии исправленную в прокси. Обычные внешние rewrites не используются. Ранний [отчёт #44](../../docs/verification/2026-10-26-layero-vps.md) отражает этап до публикации Layero; актуальные доказательства обмена перечислены выше.

## Переменные backend

| Имя                     | По умолчанию                     | Назначение                                          |
| ----------------------- | -------------------------------- | --------------------------------------------------- |
| `SYNCLI_API_UPSTREAM`   | `https://176.32.37.10`           | Фиксированный HTTPS origin VPS, без пути/реквизитов |
| `SYNCLI_WEB_ORIGINS`    | `https://syncli-main.layero.app` | Точные разрешённые браузерные origins через запятую |
| `SYNCLI_API_TIMEOUT_MS` | `20000`                          | Дедлайн upstream, допустимо 100–45000 мс            |
| `PORT`                  | `3000`                           | Порт процесса, обычно задаётся платформой           |

Переменные не закреплены в `backend.env`, чтобы настройки проекта могли их переопределить. Пароли врача/пациента, PostgreSQL и ключи в Layero не передаются: они остаются только на VPS. Прокси не требует зависимостей npm, записи на диск или собственного cookie jar.

## Транспорт

Прокси отправляет VPS `Accept-Encoding: identity`: сжатие ответа выполняет внешний слой Layero. Это исправление обнаруженного 26 октября дефекта: upstream Zstandard доходил до браузера без `Content-Encoding`, из-за чего JSON карт не читался. HTTPS и запросы Android напрямую к VPS сохранены. [Исторический отчёт дефекта и регрессии](../../docs/verification/2026-10-26-layero-compression.md), [последующая проверка загрузки карт и публичного обмена](../../docs/verification/2026-10-27-doctor-integration-polish.md).

Поддерживаются оба варианта маршрутизации Layero: вход `/api/health` и `/health` дают upstream `/api/health`. Корневой GET `/` возвращает только readiness процесса. HTTPS upstream проверяется штатно. Нельзя задавать другой сервер через клиентский URL или Host.

Сохраняются методы, query, JSON/файлы, статусы ошибок, cookie и CSRF; Set-Cookie передаются отдельными заголовками, host-only cookies принадлежат браузерному Layero-origin. Переданные клиентом forwarded-заголовки и hop-by-hop headers убираются. Ответы API содержат no-store, без ETag; HTML вместо API превращается в JSON 502. Дедлайн даёт JSON 504, POST автоматически не повторяется. Предельное входное тело — 2 МБ, файлы передаются потоком. Веб ждёт запрос до 45 секунд с учётом cold start; оборванный JSON считается неопределённым результатом, чтобы сохранить commandId для повтора.

При текущей серверной политике лимит входа считается по адресу, видимому Caddy: пользователи Layero могут делить один бюджет попыток. Доверие к произвольному X-Forwarded-For не включалось. Для большого числа пользователей потребуется отдельная проверенная схема передачи клиентского адреса/лимитов.

## Проверка

- `npm run check:layero` — локальные HTTP-тесты, cookies, CSRF, ошибки, лимиты, потоковые PDF и состав fullstack.
- `npm run check:web`, `npm run check:fixtures`, `npm run check` — обязательные общие проверки.
- `npm run check:doctor:policy` — отдельный .NET-процесс проверяет допуск Production/клиники/роли и default-deny; нужен настроенный doctor runtime.
- `python scripts/test_vps_update.py` — сохранение приватной конфигурации, обязательные файлы и откат API.
- `node scripts/verify-layero-proxy-vps.mjs --config PRIVATE_SYNTHETIC_JSON` — явная живая проверка через этот proxy к VPS. Создаёт отдельную синтетическую тестовую карту и технические сообщения, не печатает реквизиты/содержимое карт. Сеть до VPS должна быть доступна; существующий авторизованный CONNECT-туннель можно задать стандартными Node `NODE_USE_ENV_PROXY=1`, `HTTPS_PROXY` и `NO_PROXY` без отключения TLS.

Последняя команда проверяет локальный proxy → VPS, а не edge/runtime Layero. При каждой следующей поставке отдельно проверить в браузере публичный `/api/health` (JSON, release ID), login/session/logout, две независимые сессии без общего кэша, сохранение карты и обмен с Android. Выполненные публичные сценарии 27 октября описаны в [отчёте интеграции](../../docs/verification/2026-10-27-doctor-integration-polish.md); это не автоматическая приёмка следующих поставок. Сетевая ошибка не должна включать локальный режим автоматически.

## Обновление VPS

Обновляется только API, отдельно от статической поставки Layero. `deployment/demo/update-api.py` получает новый пакет с `RELEASE.json`, сверяет все файлы, создаёт зашифрованную копию БД/env/PFX/ключей, проверяет расшифровку и восстановление в отдельную БД. Затем меняет ссылку `/opt/syncli/current` и перезапускает `syncli-api`; при неуспехе health возвращает прежние API и env. БД и ключи не заменяются.

Синтетические команды включаются только для указанной клиники настройками `Clinical__SyntheticEnabled=true` и `Clinical__SyntheticClinicIds=CLINIC_ID`. Production сохраняется; по умолчанию допуск выключен. Это технический допуск синтетического стенда, без изменения статусов клинических источников.

Применение от root: `python3 update-api.py STAGE RELEASE --clinic CLINIC_ID --backup-password-file PRIVATE_PASSWORD_FILE`. Существующий первичный installer повторно не запускается. Откат API/env: `python3 update-api.py --rollback RELEASE --backup-password-file PRIVATE_PASSWORD_FILE`; данные с дополнительными JSON-полями сохраняются. Зашифрованную копию и пароль хранить также вне VPS раздельно. Перед поставкой сохранены предыдущая версия и исходные реквизиты; необходимые команды и IDs фиксируются в отчёте релиза без секретов.

Документация: [fullstack Layero](https://docs.layero.ru/deploys/layero-json/), [runtime](https://docs.layero.ru/runtime/overview), [lifecycle](https://docs.layero.ru/en/runtime/lifecycle), [план](../../docs/superpowers/plans/2026-10-26-doctor-vps-connection.md).
