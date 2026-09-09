export type AppTheme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'biathlon_theme';

class ThemeService {
  private currentTheme: AppTheme = 'dark';
  private listeners: Set<(theme: AppTheme) => void> = new Set();
  private mediaQuery: MediaQueryList | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        this.currentTheme = saved;
      } else {
        this.currentTheme = 'dark';
      }

      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', () => {
        if (this.currentTheme === 'system') {
          this.apply();
        }
      });

      this.apply();
    }
  }

  public getTheme(): AppTheme {
    return this.currentTheme;
  }

  public setTheme(theme: AppTheme): void {
    this.currentTheme = theme;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, theme);
      this.apply();
    }
    this.listeners.forEach((listener) => listener(theme));
  }

  public getResolvedTheme(): 'light' | 'dark' {
    if (this.currentTheme === 'system') {
      if (typeof window !== 'undefined' && this.mediaQuery) {
        return this.mediaQuery.matches ? 'dark' : 'light';
      }
      return 'dark';
    }
    return this.currentTheme;
  }

  public apply(): void {
    if (typeof document === 'undefined') return;
    const resolved = this.getResolvedTheme();
    const root = document.documentElement;

    if (resolved === 'light') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark', 'dark');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.add('theme-dark', 'dark');
      root.classList.remove('theme-light');
      root.setAttribute('data-theme', 'dark');
    }
  }

  public subscribe(callback: (theme: AppTheme) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

export const themeService = new ThemeService();
