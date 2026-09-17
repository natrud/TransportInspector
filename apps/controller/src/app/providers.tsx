import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { initDb, setupQueryFocus } from '@transport/shared';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await initDb();
        if (cancelled) return;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[app] init failed', err);
      }
    })();
    // Прив'язуємо «фокус» React Query до стану застосунку. Виклики водіїв
    // навмисно лишаються з refetchIntervalInBackground: true — їх контролер
    // має бачити і зі згорнутим застосунком.
    const unsubscribeFocus = setupQueryFocus();

    return () => {
      cancelled = true;
      unsubscribeFocus();
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
