import { create } from 'zustand';
import { vscodeApi } from '@/hooks/useVSCode';

export type Theme = 'dark' | 'light';

function readPersistedTheme(): Theme {
  try {
    const persisted = (vscodeApi.getState() as { theme?: Theme }).theme;
    if (persisted === 'light' || persisted === 'dark') { return persisted; }
  } catch {
    // outside webview
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

function persistTheme(theme: Theme) {
  try {
    vscodeApi.setState({ ...vscodeApi.getState(), theme });
  } catch {
    // outside webview
  }
}

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Applied at module-evaluation time — App/Header import this before main.tsx
// calls render(), so `data-theme` is set before first paint (no flash).
const initialTheme = readPersistedTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    persistTheme(next);
    set({ theme: next });
  },
}));
