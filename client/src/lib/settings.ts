import { api } from './api';
import { useAuth } from './auth';
import type { Settings } from './types';
/** Save part of the user's settings to the backend, then reload them (so a refresh shows the same values). */
export function useSaveSettings() {
  const { refreshMe } = useAuth();
  return async (patch: Partial<Settings>) => { await api.patch('/me/settings', patch); await refreshMe(); };
}
