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
    void initDb().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[driver] initDb failed', err);
    });
    // Згорнутий застосунок перестає опитувати сервер і дотягує свіже при
    // поверненні — без цього polling працює цілодобово.
    return setupQueryFocus();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
