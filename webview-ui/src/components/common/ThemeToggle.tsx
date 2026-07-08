import { useThemeStore } from '@/store/slices/themeStore';
import Tooltip from '@/components/common/Tooltip';

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  return (
    <Tooltip content={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
      <button
        type="button"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-sf-border text-sf-text-2 transition-colors hover:border-sf-accent/40 hover:text-sf-text"
      >
        <span className="text-xs leading-none">{isDark ? '☀️' : '🌙'}</span>
      </button>
    </Tooltip>
  );
}
