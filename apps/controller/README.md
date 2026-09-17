# Transport Inspector

React Native / Expo (bare workflow) застосунок для транспортного контролера й
водія: перевірка валідності QR-квитків та лайв-моніторинг провалідованих
квитків за маршрутом.

## Ролі

- **Контролер** — сканує QR квитків, бачить результат валідації, переглядає
  активність будь-якого маршруту з селектором.
- **Водій** — read-only стрічка валідованих квитків на привʼязаному маршруті
  (привʼязка приходить із адмінки), без деталей конкретних квитків.

## Stack

- Expo SDK 51 (bare) + React Native 0.74 + React 18.2 + Hermes
- React Navigation v6 (native stack)
- @tanstack/react-query v5 (polling, mutations, query cache)
- react-native-vision-camera (QR-сканер)
- expo-secure-store (session + settings persistence)
- @op-engineering/op-sqlite (локальний журнал валідацій, опціонально)
- Zod (runtime-валідація DTO)

## Структура

- `App.tsx`, `index.ts` — entrypoint
- `src/app/` — навігація, providers
- `src/screens/` — Login, Home, Scanner, TicketResult, RouteActivity, Settings
- `src/components/` — UI-компоненти
- `src/hooks/` — React Query hooks (useSession, useRouteActivity, ...)
- `src/lib/` — клієнт API, парсер QR, формат, haptics
- `src/data/` — mock-API (tickets, routes, auth-roles) + in-memory store
- `src/types/` — domain-моделі (Ticket, Route, Session) за схемою бекенда
- `src/contracts/` — error taxonomy
- `android/` — нативний Android проект (`ua.transport.inspector`)

## QR-формат

Парсер `src/lib/qr-parser.ts` толерантний — підтримує три варіанти:

```
{"ticket_id": "a1b2c3d4e5f6g7h8", "hash": "xyz"}     # JSON (priority)
a1b2c3d4e5f6g7h8:xyz                                  # id:hash
a1b2c3d4e5f6g7h8                                      # bare id (legacy)
```

`hash` зіставляється з `Ticket.validation_card_hash` на бекенді. Якщо `hash`
у QR відсутній — перевіряємо тільки за `ticket_id`.

## Domain-модель квитка

Точне дзеркало `class Ticket(Base)` з SQLAlchemy-схеми реального бекенда
(`src/types/ticket.ts`). Поля, enums, типи `String(N)` — все збережено.

## Підʼєднання реального бекенда

`src/data/*-api.ts` — mock-шар, що повертає типи з `src/types/ticket.ts`.
Підмінюється на `api()`-виклики з `src/lib/api.ts` без змін у UI/hooks.

Контракти, які треба реалізувати:

- `POST /tickets/{id}/validate` — `{ticket_id, hash, serial_number, door_number, route_id} → Ticket | ValidationError`
- `GET /routes` — `Route[]`
- `GET /routes/{id}/activity` — `RouteActivityResponse` (entries + counters)
- `GET /me` — `Session` (`role`, `assigned_route_id`)

## TODO налаштувати перед першим запуском

1. `app.json.extra`:
   - `apiBaseUrl` — реальний URL бекенда
   - `oidcAuthority`, `oidcClientId` — параметри Keycloak / OIDC провайдера
2. `eas.json` — заповнити profiles, projectId
3. `android/app/google-services.json` — за потреби FCM push

## Quick start

```bash
pnpm install
pnpm prebuild        # за потреби
pnpm android         # або pnpm start
pnpm test            # vitest
pnpm typecheck       # tsc --noEmit
```

## Налаштування polling

Інтервал refetch для RouteActivity керується у `Settings`. Мінімум 10 секунд,
максимум 5 хвилин. Зберігається у SecureStore між сесіями.
