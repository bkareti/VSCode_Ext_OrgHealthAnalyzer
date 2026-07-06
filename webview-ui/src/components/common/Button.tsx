import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'danger';
type Size    = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-sf-accent text-white hover:opacity-90 disabled:opacity-40',
  ghost:   'border border-sf-border text-sf-text-2 hover:text-sf-text hover:border-sf-accent disabled:opacity-40',
  danger:  'border border-sev-error/40 text-sev-error bg-sev-error/10 hover:bg-sev-error/20 disabled:opacity-40',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs rounded',
  md: 'px-3 py-1.5 text-xs rounded-lg',
};

export default function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
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
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className
      )}
      {...rest}
    >
      {loading && (
        <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin shrink-0" />
      )}
      {children}
    </button>
  );
}
