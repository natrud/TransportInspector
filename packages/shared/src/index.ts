// Public API of @transport/shared.
// Apps імпортують лише через цей barrel або через subpath exports.

// Domain types
export * from './types/ticket';

// Library utilities
export * from './lib/qr-parser';
export * from './lib/ticket-schema';
export * from './lib/format';
export * from './lib/haptics';
export * from './lib/session-storage';
export * from './lib/settings-storage';
export * from './lib/clock-drift';
export * from './lib/query-focus';
export * from './lib/auth-events';
export * from './lib/db';
export * from './lib/shift-report';
export * from './lib/app-access';
export { api, ApiError } from './lib/api';
export {
  type Tokens,
  buildAuthRequest,
  clearTokens,
  exchangeCodeForTokens,
  getDiscovery,
  loadTokens,
  persistTokens,
  saveLoginToken,
} from './lib/auth';
export { getCachedEtag, setCachedEtag } from './lib/etag-cache';
// push-notifications НЕ реекспортується тут навмисно: цей модуль на
// top-level чіпає нативний expo-notifications, якого нема в driver-збірці.
// Через барель Metro тягне його в кожен застосунок, що імпортує будь-що з
// '@transport/shared' — це й ламало запуск driver. Хто потребує push
// (controller) — імпортує напряму: '@transport/shared/lib/push-notifications'.

// Mock data layer (зміниться на справжні api()-виклики при підʼєднанні бекенда)
export * from './data/mock-store';
export * from './data/tickets-api';
export * from './data/routes-api';
export * from './data/auth-roles';
export * from './data/validation-log';
export * from './data/fines-api';
export * from './data/trip-sessions';
export * from './data/support-api';
export * from './data/offline-sync';
export * from './data/inspections-api';
export * from './data/route-inspection-api';
export * from './data/readers-api';
export * from './data/transport-fares-api';

// React Query hooks — useRealLogin, useSelectRoute для email/password авторизації
export * from './hooks/useSession';
export * from './hooks/useLayout';
export * from './hooks/useSettings';
export * from './hooks/useRoutes';
export * from './hooks/useRouteActivity';
export * from './hooks/useTicketValidate';
export * from './hooks/useNetworkStatus';
export * from './hooks/useRecentValidations';
export * from './hooks/useShiftSummary';
export * from './hooks/useFines';
export * from './hooks/useOfflineSync';
export * from './hooks/usePassengerCounter';
export * from './hooks/useTripSession';
export * from './hooks/useCallController';
export * from './hooks/usePaymentComparison';
export * from './hooks/useControllerCalls';
export * from './hooks/useInspections';
export * from './hooks/useRouteInspection';
export * from './hooks/useReaderBlock';
export * from './hooks/useTransportFares';

// Theme
export * from './theme/colors';
export * from './theme/useColors';

// Components
export { NetworkStatusBanner } from './components/NetworkStatusBanner';
export { ReadersBlockCard, type ReadersAudience } from './components/ReadersBlockCard';
export { AccessDeniedScreen } from './components/AccessDeniedScreen';

// Error taxonomy
export * from './contracts/errors';
