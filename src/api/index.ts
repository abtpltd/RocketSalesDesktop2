import type { Api } from './types';
import { tauriApi } from './tauri';

// VITE_MOCK=1 (npm run dev:mock) runs the whole UI with sample data and no server.
// The mock is imported lazily so it is not part of the installer build.
export async function loadApi(): Promise<Api> {
  if (import.meta.env.VITE_MOCK === '1') {
    const { createMockApi } = await import('./mock');
    return createMockApi();
  }
  return tauriApi;
}
export const isMock = import.meta.env.VITE_MOCK === '1';
