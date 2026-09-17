import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { setHapticsEnabled } from '../lib/haptics';
import {
  type AppSettings,
  defaultSettings,
  loadSettings,
  persistSettings,
} from '../lib/settings-storage';

export const SETTINGS_KEY = ['settings'] as const;

export function useSettings(): {
  settings: AppSettings;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: loadSettings,
    staleTime: 60_000,
    // Саме placeholderData, а не initialData: initialData лягає в кеш як
    // свіжа відповідь, тож із staleTime 60 c застосунок ЦІЛУ ХВИЛИНУ жив би
    // на дефолтах і не питав сервер — збережені в акаунті налаштування
    // застосовувались із хвилинною затримкою після кожного запуску.
    placeholderData: defaultSettings,
  });

  useEffect(() => {
    setHapticsEnabled(data?.hapticsEnabled ?? true);
  }, [data?.hapticsEnabled]);

  return {
    settings: data ?? defaultSettings,
    isLoading,
  };
}

export function useUpdateSettings(): {
  update: (next: Partial<AppSettings>) => Promise<AppSettings>;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: persistSettings,
    onSuccess: (next) => {
      qc.setQueryData(SETTINGS_KEY, next);
    },
  });
  return { update: mutation.mutateAsync, isPending: mutation.isPending };
}
