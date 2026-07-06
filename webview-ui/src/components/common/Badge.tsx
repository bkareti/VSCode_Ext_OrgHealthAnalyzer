import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info';

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<Variant, string> = {
  default: 'bg-sf-bg-3 text-sf-text-2 border-sf-border',
  accent:  'bg-sf-accent/15 text-sf-accent border-sf-accent/30',
  success: 'bg-score-excellent/15 text-score-excellent border-score-excellent/30',
  warning: 'bg-sev-warning/15 text-sev-warning border-sev-warning/30',
  error:   'bg-sev-error/15 text-sev-error border-sev-error/30',
  info:    'bg-sev-info/15 text-sev-info border-sev-info/30',
};

export default function Badge({ variant = 'default', children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
        VARIANT_CLASS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
