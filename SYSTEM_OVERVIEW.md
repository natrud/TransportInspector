# Транспортний інспектор — опис системи

## 1. Призначення

Дві мобільні апки на Android для роботи з QR-квитками громадського транспорту:

| Апка | Кого обслуговує | Що робить |
|---|---|---|
| **Контролер** (`ua.transport.controller`) | Транспортний контролер у польових умовах | Сканує QR, перевіряє валідність, видає постанови за ст. 135 КУпАП, веде журнал зміни |
| **Водій** (`ua.transport.driver`) | Водій маршруту | Бачить live-стрічку валідованих квитків на своєму маршруті, рахує пасажирів, контролює оплату, може викликати контролера |

Реальний бекенд відсутній — застосунки працюють на in-memory mock-шарі, який імітує контракти майбутнього REST API. Структура даних квитка точно відповідає `class Ticket(Base)` з SQLAlchemy-схеми (надано замовником).

## 2. Архітектура

**Monorepo** з pnpm workspaces:

```
TransportInspector/
├── packages/
│   └── shared/                ← Спільний код для обох апок
│       ├── types/             Domain типи (Ticket, Route, Session, Fine ...)
│       ├── lib/               API-клієнт, парсер QR, формат, haptics, storage, db
│       ├── data/              Mock-API (tickets, routes, auth, fines, trip-sessions)
│       ├── hooks/             React Query hooks
│       ├── components/        NetworkStatusBanner
│       ├── theme/             colors, useColors
│       └── contracts/         Error taxonomy
└── apps/
    ├── controller/            ← Контролерська apk (ua.transport.controller)
    │   ├── src/screens/       Home, Scanner, TicketResult, ManualEntry,
    │   │                      RecordFine, FineReceipt, RecentScans (=Журнал),
    │   │                      Settings, Login
    │   └── src/app/           navigation (Bottom Tabs), providers, linking
    └── driver/                ← Водійська apk (ua.transport.driver)
        ├── src/screens/       Home (one-screen), Settings, Login
        └── src/app/           navigation, providers, linking
```

## 3. Технічний стек

- **React Native 0.74** + **Expo SDK 51** (bare workflow)
- **TypeScript 5.5**, strict mode
- **React Navigation 6** — Stack + Bottom Tabs (controller)
- **TanStack Query 5** — серверний state, polling, мутації
- **react-native-vision-camera** — QR-сканер (controller)
- **react-native-qrcode-svg** + **expo-print** — квитанції постанов
- **expo-secure-store** — сесія, налаштування
- **@op-engineering/op-sqlite** — локальна БД (журнал сканів, постанови, тапи, рейси)
- **Zod** — runtime-валідація DTO
- **Vitest** — unit-тести (34 проходять)

Хостинг для CI: EAS (`eas.json` заглушки).

## 4. Domain-моделі

### `Ticket`

Дзеркало `class Ticket(Base)` з реального бекенда. Поля (всі ISO-8601 для дат):

```ts
{
  id: string                              // String(16), UUID hex[:16]
  order_id: string
  user_id: string                         // String(36)
  transport: 'bus' | 'trolley' | 'tram' | 'metro' | 'minibus' | string
  price: number                           // у копійках
  status: 'issued' | 'active' | 'used' | 'expired'
  fare_type: 'paid' | 'free'
  created_at: string
  use_by_days: number                     // default 30
  validated_at: string | null
  active_until: string | null             // вікно валідації, типово 1 год
  validated_serial_number: string | null  // GID контролера/валідатора
  validated_door_number: number | null
  validation_method: 'qr' | 'ble' | 'nfc' | null
  validation_card_hash: string | null     // SHA-256
  department_id: string | null
}
```

### Інші типи
- `Route` — `{ id, code, name, transport }`
- `Session` — `{ user_id, display_name, role, serial_number, assigned_route_id }`
- `Fine` — постанова про правопорушення (ст. 135 КУпАП)
- `TripSession`, `PassengerTap` — для водія
- `ValidationResult`, `ValidationFailureReason` — результат скану

## 5. QR-формат квитка

Парсер `src/lib/qr-parser.ts` приймає три формати (за пріоритетом):

```
1. JSON:        {"ticket_id":"a1b2c3d4e5f6g7h8","hash":"abc..."}
2. id:hash:     a1b2c3d4e5f6g7h8:abc...
3. голий id:    a1b2c3d4e5f6g7h8        ← fallback / legacy
```

`hash` (опційний) — звіряється з `validation_card_hash` на бекенді як захист від «вгадай UUID».

## 6. Контролерський застосунок

### Призначення

Перевірка квитків у польових умовах: швидке сканування QR, реакція на невалідні (видача постанов), журнал зміни, експорт звіту.

### Навігація — Bottom Tab Bar з 3 табами

| Tab | Екран | Призначення |
|---|---|---|
| **Головна** | `HomeScreen` | Швидкий доступ до основних дій + останні скани |
| **Журнал** | `RecentScansScreen` | Усі мої сканування + видані постанови за зміну |
| **Опції** | `SettingsScreen` | Налаштування + звіт + logout |

Поверх табів — modal-stack для дій:
- `Scanner` — QR-сканер
- `TicketResult` — результат скану
- `ManualEntry` — ввід ID вручну
- `RecordFine` — форма постанови
- `FineReceipt` — квитанція 57мм

### Головна (Home)

Згори донизу:
1. Рядок «`{GID}` · `{імʼя}`»
2. «За зміну перевірено: **N**»
3. Велика синя кнопка **«Сканувати QR квитка»** (≈30% екрана)
4. Дві кнопки в ряд: **«Ввід вручну»** (білий) / **«Видати постанову»** (червоний)
5. Картка **«Останні скани»** — 3 останні валідації, з empty state «Ще немає сканів»

### Сценарії

**Сценарій 1 — типовий: пасажир показує QR, контролер скан**

```
Home → "Сканувати QR" → Scanner (камера)
       → автоматично після scan → TicketResult
       → якщо valid → "На головну" або "Сканувати наступний"
       → якщо invalid → видно ✕ червоний банер + червону кнопку
                        "Видати постанову (ст. 135 КУпАП)"
                        → RecordFine (auto-filled) → FineReceipt
```

**Сценарій 2 — QR не зчитується / пасажир дає номер усно**

```
Home → "Ввід вручну" → ManualEntry
       → вводить ticket_id (опційно + hash) → "Перевірити"
       → далі як у Сценарії 1
```

**Сценарій 3 — пасажир без квитка взагалі**

```
Home → "Видати постанову" → RecordFine (без auto-fill)
       → вибирає причину "Без квитка" → ПІБ + документ → "Видати"
       → FineReceipt
```

**Сценарій 4 — масовий контроль (експрес-режим)**

```
Settings → увімкнути "Експрес-режим скану"
Home → "Сканувати QR" → Scanner
       → валідні: ✓ зелений toast 1.5с, камера лишається активна
                  → одразу сканує наступний QR
       → невалідні: завжди переходять на TicketResult
                    (бо потрібне рішення видавати постанову чи ні)
```

### Видача постанови (RecordFine)

Спрощена форма (А+С варіант):

- **Сума зверху**: червона картка `300.00 грн` з формулою `20 × 15.00 грн (ст. 135 КУпАП)`
- **Banner auto-fill** ✓ якщо прийшов з TicketResult: «Дані квитка автозаповнено: tkt0005used00»
- **ПІБ** — одне поле
- **Документ** — 3 chips (Паспорт / Студентський / Інше) + поле «Номер документа»
- **Причина** — 3 chips (Без квитка / Прострочений / Підробка QR), автоматично preselect з reason скану
- **Sticky кнопка** «Видати постанову · {сума}» внизу

Внутрішньо `reason` мапиться на повний бекенд-enum (`expired`, `used`, `invalid_qr`, `no_ticket`, `no_concession_doc`, `unpaid_luggage`) — UI лише групує.

### Квитанція (FineReceipt)

Стилізована під **термопринтер 57мм**:
- Моноспейс шрифт, ширина 32 символи
- Шапка: «ПОСТАНОВА ПРО ШТРАФ за ст. 135 КУпАП»
- Дата/час, контролер (GID), маршрут, дані порушника, причина, формула суми
- QR-код з ID постанови (для оплати/реєстрації)
- Знизу: «Сплатити протягом 15 днів»
- Кнопки: **«Друкувати на термопринтері»** (через Android Print Service), **«Поділитися текстом»**, «На головну»

Реальна інтеграція з ESC/POS Bluetooth-принтером — TODO; зараз працює через системний Print Service для PDF-friendly принтерів.

### Журнал (RecentScansScreen)

Єдиний хронологічний список з фільтром: **Усі / Скани / Постанови**.
- Скан-рядок: ✓/✕ + ticket_id + причина + час
- Постанова-рядок: ₴ + ПІБ + причина + сума + час
- Тап на постанову → відкривається `FineReceipt` (re-друк).

### Settings — Опції

- **Базова ціна квитка** — chips (8/12/15/20/25/30 грн). Штраф = ціна × 20. У продакшені оновлюється з адмінки.
- **Експрес-режим скану** — toggle (див. Сценарій 4).
- **Тактильна віддача** — toggle.
- **Звіт за зміну** — кнопка, генерує текст з CSV-таблицями за останні 12 год, відкриває Share-sheet (SMS/email/messenger).
- **Logout**.

### Mock-сесія

Login mock'ом: «Марія (контролер) · INS-001». Реальний — OIDC через `expo-auth-session` (вже інтегровано, потребує бекенда).

## 7. Водійський застосунок

### Призначення

Робоче місце водія: моніторинг валідацій на своєму маршруті, ручний підрахунок пасажирів, що увійшли, контроль розриву між «увійшло» і «оплатили», виклик контролера на маршрут.

### Навігація — Stack з 2 екранами

| Екран | Призначення |
|---|---|
| **Home** | Єдиний екран зі всіма функціями — без табів |
| **Settings** | Налаштування + logout |

### Home — секції згори донизу

1. **Header**: маршрут (код + назва) + імʼя водія
2. **Trip controls**: велика картка «Розпочати рейс» / «Завершити рейс» (зеленa / червонa)
3. **Passenger counter**: ВЕЛИКА плита-кнопка (~340pt висоти):
   - Велика цифра пасажирів (160pt)
   - «Тап у будь-яке місце = +1»
   - Тап = +1 (з тактилем)
   - Знизу «Відмінити останній (−1)»
   - Disabled state коли рейс не активний: «Розпочни рейс, щоб рахувати»
4. **Контроль оплати** (видно лише під час активного рейсу):
   - Заголовок «КОНТРОЛЬ ОПЛАТИ ЗА 30 ХВ» (вікно у налаштуваннях)
   - Три цифри: **Увійшло** / **Валідовано** / **Різниця**
   - Інтерпретація:
     - ✓ Зелений «Усі пасажири валідували квиток» — різниця ≤ 0% / ≤ 5%
     - ⚠ Жовтий «X (Y%) без квитка...» — 5–15%
     - 🔴 Червоний «X (Y%) без квитка...» — > 15%
     - «Валідовано більше — звір лічильник» — entered < validated
5. **Активність маршруту**: collapsable картка з лічильниками за добу + список останніх валідацій. За замовчуванням collapsed коли рейс активний (фокус на counter).
6. **Викликати контролера** — оранжева кнопка → mock POST → toast «Запит надіслано»
7. **Налаштування** — посилання на SettingsScreen

### Лічильник пасажирів — модель даних

- SQLite таблиця `passenger_taps` — один рядок на тап, `undone=1` для відмінених
- SQLite таблиця `trip_sessions` — старт/кінець рейсу + фінальний `passenger_count`
- Один запит `getPassengerTapStats(tripId, sinceMs)` повертає одразу `{ total, inWindow }` — джерело правди для counter і для контролю оплати (unified data source, нема розсинхронізації)

### Контроль оплати — алгоритм

```
entered    = COUNT(passenger_taps WHERE trip_id=current AND undone=0 AND tapped_at >= now - 30min)
validated  = COUNT(route_activity_entries WHERE validated_at >= now - 30min)
diff       = entered - validated

if entered == 0 and validated == 0  → idle (нема активності)
if entered < validated              → undercount (звір лічильник)
if diff == 0                        → ok (✓ усі оплатили)
if diff > 0
  percentUnpaid = diff / entered * 100
  if percent > 15% → danger
  elif percent > 5% → warn
  else → ok
```

Polling інтервал — той самий, що у RouteActivity (10/15/30/60/120с з налаштувань).

### Settings — Опції водія

- **Polling активності маршруту** — chips 10/15/30/60/120с
- **Контроль оплати — вікно** — chips 30/45/60 хв
- **Лічильник пасажирів** — toggle on/off (вимкнення приховує плиту-кнопку)
- **Тактильна віддача** — toggle
- **Logout**

### Виклик контролера

Mock POST `/support/call-controller` → 600мс затримка → toast «Запит надіслано. Контролер прибуде на маршрут ≈ 12–30 хв». Реальна інтеграція потребує бекенду з push-сповіщеннями контролеру.

### Mock-сесія

«Олексій (водій) · DRV-001 · Маршрут 23 · Площа Незалежності — Троєщина». У продакшені — OIDC, маршрут водія приходить з адмінки.

## 8. Mock backend (in-memory)

`packages/shared/src/data/`:

| Модуль | Що мокає |
|---|---|
| `mock-store.ts` | Тестові квитки + маршрути |
| `tickets-api.ts` | `validateTicket`, `getRouteActivity` (з генератором синтетичних валідацій) |
| `routes-api.ts` | `listRoutes`, `getRoute` |
| `auth-roles.ts` | `mockLogin(role, routeId?)` |
| `fines-api.ts` | `saveFine`, `listFines`, `getFine` + mock POST у бекенд |
| `trip-sessions.ts` | Рейси водія + passenger taps |
| `support-api.ts` | `callController` |
| `validation-log.ts` | Журнал сканів контролера (з SQLite) |

Усі функції повертають типи відповідні майбутньому REST. Замінити на справжні `api()` виклики — без зміни UI / hooks.

### Тестові квитки (для ManualEntry на симуляторі)

| ID | Hash | Результат |
|---|---|---|
| `tkt0002issued` | `hash-tkt0002-paid` | ✓ Valid (issued → active) |
| `tkt0003free00` | `hash-tkt0003-free` | ✓ Valid, пільговий |
| `tkt0005used00` | (any) | ✕ Used |
| `tkt0006expir` | (any) | ✕ Expired |
| `tkt0004fake00` | `wrong-hash` | ✕ Hash-mismatch |
| `tkt0001active` | (any) | ✓ Valid (повторний скан) |
| `nonexistent` | (any) | ✕ Not-found |

## 9. SQLite — локальні таблиці

`packages/shared/src/lib/db.ts`:

| Таблиця | Призначення | Використовується |
|---|---|---|
| `validation_log` | Журнал сканів контролера | Controller: Журнал, Home preview, експорт |
| `fines` | Видані постанови | Controller: Журнал, експорт, re-друк |
| `passenger_taps` | Тапи пасажирів водія (один тап = рядок, undo=1 при відмінах) | Driver: counter, контроль оплати |
| `trip_sessions` | Рейси водія (start/end + фінальний passenger count) | Driver: trip controls |

Журнал валідацій і постанов працює офлайн — записи накопичуються локально, потім (у майбутньому) sync'аться на бекенд.

## 10. Контракти для майбутнього бекенду

При підʼєднанні реального API замінюються лише функції в `packages/shared/src/data/*-api.ts`. UI/hooks не зачіпаються.

```
POST /tickets/{id}/validate   → ValidationResult
GET  /routes                   → Route[]
GET  /routes/{id}/activity     → RouteActivityResponse
POST /fines                    → Fine (server_id)
POST /support/call-controller  → { request_id, eta_min }
GET  /me                       → Session (role, assigned_route_id)
```

## 11. Запуск

```bash
# Однократно
pnpm install

# Контролерська апка
pnpm controller:prebuild       # генерує android/ (одноразово)
pnpm controller:android        # збирає + інсталює на емулятор

# Водійська апка
pnpm driver:prebuild
pnpm driver:android

# Metro для кожної апки запускається окремо (один порт 8081)
pnpm controller:start          # або
pnpm driver:start

# Tests + typecheck
pnpm test                      # vitest, 34 тести
pnpm typecheck                 # tsc -r
```

На одному емуляторі можна тримати обидві APK одночасно (різні `applicationId`).

## 12. Що поки немає (TODO)

1. **Реальний бекенд** — на місці mock-шару. Контракти готові.
2. **OIDC автентифікація** — модулі (`expo-auth-session`) встановлені, треба підключити до Keycloak/Auth0.
3. **Bluetooth ESC/POS принтер** для квитанцій — зараз працює лише Android Print Service.
4. **Push notifications** — Firebase Cloud Messaging для виклику контролера та критичних подій.
5. **Реальна камера тестування** — на симуляторі неможливо сканувати; для тестингу invalid сценаріїв використовуйте ManualEntry з мок-IDs.
6. **GPS-стемпінг** сканів/постанов — для audit trail (privacy considerations).
7. **«Підозрілі квитки»** як окремий tab — потребує серверного detection (наприклад, повторні валідації одного QR за 10 хв на маршруті).
8. **Друкована статистика для замовника/керівництва** — можна додати у Settings контролера як CSV-експорт за обраний період (зараз — лише за останні 12 год).

## 13. Тестові акаунти

Login mock'ується — нема паролів. Достатньо вибрати роль:
- **Контролер**: Марія, INS-001
- **Водій**: Олексій, DRV-001, маршрут 23

У продакшені — повний OIDC flow з реальною ідентифікацією.

## 14. Блокування зчитувачів на час перевірки

Коли контролер починає перевірку в транспорті, зчитувачі (валідатори) цього ТЗ
переводяться в режим блокування — щоб пасажир без квитка не «оплатив проїзд»
рівно в ту мить, коли до нього підходить контролер.

### Хто це робить

Блокування виконує **бекенд**, а не телефон: перевірка стартує вебхуком від
валідатора (контролер прикладає особистий QR), тож команда спрацює навіть із
закритим застосунком. Логіка — `backend/app/core/reader_blocking.py`.

```
QR контролера у валідаторі
   → POST /api/v1/validator/webhook (EXT_CARD_REQUEST)
   → inspection START
   → фонова задача: DOOR_DOBURGLARY на всіх зчитувачах цього ТЗ
   → повторний QR / «Завершити» / закриття водієм
   → DOOR_DONORMAL
```

Область команди — **транспортний засіб** (route_number + vehicle_number з
`validator_controllers`), а не весь маршрут.

### Автозавершення перевірки — 15 хвилин (налаштовується)

Перевірку закриває людина: контролер (повторний QR або кнопка) чи водій. Якщо
цього не сталось, перевірка **завершується сама через 15 хв від старту**, а
разом з нею відкриваються зчитувачі.

Обидва строки — операційні параметри, а не константи коду. Змінюються в
адмінці, `/admin/app-setting/list`, без деплою:

| Ключ | Типово | Що робить |
|---|---|---|
| `inspection_auto_close_minutes` | 15 | Через скільки перевірка завершується сама |
| `inspection_auto_close_ack_minutes` | 60 | Скільки після автозавершення QR у тому ж транспорті читається як «вихід», а не як нова перевірка |

Зміна підхоплюється не пізніше ніж за 30 с (кеш читання налаштувань). Числа в
застосунках не зашиті — і контролер, і водій бачать відлік, порахований
сервером, тож після зміни в адмінці тексти оновлюються самі.

Правило видно всім і заздалегідь, а не постфактум:

- контролер — alert на старті, відлік «автозавершення через N хв» на екрані QR
  і на головному екрані;
- водій — той самий відлік у картці «контролер працює на рейсі» та на екрані
  «Контролер».

Контролер, який ще працює, продовжує перевірку повторним прикладанням QR (це
почне нову). А якщо він прикладає QR «на вихід» після автозавершення — протягом
години це читається як підтвердження завершення, а не як старт нової перевірки
з новим блокуванням.

### Страховка

- Той самий фоновий цикл (раз на 30 с) спершу автозавершує прострочені
  перевірки, а потім знімає блокування зі зчитувачів завершених перевірок.
- Окремий стеля-таймер `READER_BLOCK_MAX_SECONDS` (30 хв) страхує блокування,
  не привʼязані до перевірки — наприклад ручну кнопку водія.
- Кожна невдала команда лишається у `validator_controllers.readers_block_error`
  і показується в обох застосунках — «тихо не спрацювало» неможливо.
- Команда «відкрити» повторюється кожні 30 с, поки прилад не підтвердить: поки
  підтвердження немає, у БД прилад лишається закритим і потрапляє у наступний
  прохід сторожа.

### Що бачать застосунки

Стан приходить тим самим polling'ом, що й присутність контролера:
`readers` у `GET /api/v1/driver/route-inspection` (водій) та
`GET /api/v1/inspector/inspection/current` (контролер). Малює його спільний
компонент `ReadersBlockCard` — формулювання в обох апках однакові.

| Роль | Де | Що може |
|---|---|---|
| Водій | Home — банер; «Контролер» — секція «Зчитувачі у транспорті» | Резервні кнопки **Заблокувати** / **Розблокувати** (кожна через alert-підтвердження) |
| Контролер | Home — компактний рядок; екран QR — картка | Повтор команди, якщо автоматика не пройшла |

### Ендпоінти

```
GET  /api/v1/driver/readers?route_number=&vehicle_number=   → стан
POST /api/v1/driver/readers/block | unblock                  → резерв водія
POST /api/v1/inspector/inspection/current/readers            → повтор контролера
POST /api/v1/validator/readers/{serial}/block | unblock      → адмінський, один прилад
```

---

Згенеровано як supplemental документація для проекту `transport-inspector-monorepo`.
Останнє оновлення: 2026-09-15.
