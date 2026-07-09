import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'danger' | 'gradient';
type Size    = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Renders as a small circular icon-only button (e.g. an AI "Generate" trigger) instead of a padded text button. */
  iconOnly?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:  'bg-sf-accent text-white hover:opacity-90 disabled:opacity-40',
  ghost:    'border border-sf-border text-sf-text-2 hover:text-sf-text hover:border-sf-accent disabled:opacity-40',
  danger:   'border border-sev-error/40 text-sev-error bg-sev-error/10 hover:bg-sev-error/20 disabled:opacity-40',
  gradient: 'bg-gradient-to-br from-sf-accent to-purple-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.45)] hover:shadow-[0_0_16px_rgba(99,102,241,0.7)] disabled:opacity-40 disabled:shadow-none',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs rounded',
  md: 'px-3 py-1.5 text-xs rounded-lg',
};

/** A small 4-point "sparkle" glyph — no icon package dependency, themes via currentColor. */
function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

export default function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  iconOnly = false,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium transition-all shrink-0',
        iconOnly ? 'w-7 h-7 rounded-full' : SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin shrink-0" />
      ) : iconOnly ? (
        <SparkleIcon />
      ) : null}
      {!iconOnly && children}
    </button>
  );
}
