import { createContext, useContext, useEffect, type ReactNode } from 'react';

type Theme = 'light';

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {} });

// The application is light-only. Any previously stored dark preference is discarded.
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    try { localStorage.removeItem('app-theme'); } catch { /* ignore */ }
  }, []);

  return <ThemeContext.Provider value={{ theme: 'light', setTheme: () => {} }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
