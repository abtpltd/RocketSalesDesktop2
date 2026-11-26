import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { loadApi } from './api';
import { SessionProvider } from './session';
import App from './App';
import { ThemeProvider } from './theme';
import './styles.css';
import { keepPrefs } from './ui/prefsFile';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 } },
});

loadApi().then(async (api) => {
  // restore screen settings from the file before the first screen reads them (gives up after 1.5 s)
  await keepPrefs({ load: () => api.prefsLoad(), save: (p) => api.prefsSave(p) });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider api={api}>
            <App />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
});
