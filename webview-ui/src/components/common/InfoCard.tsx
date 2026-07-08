import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'error' | 'warning' | 'success' | 'info';

const BORDER: Record<Variant, string> = {
  default: 'border-sf-border',
  error:   'border-sev-error/40',
  warning: 'border-sev-warning/40',
  success: 'border-score-good/40',
  info:    'border-sev-info/40',
};

const BG: Record<Variant, string> = {
  default: 'bg-sf-bg-2',
  error:   'bg-sev-error/5',
  warning: 'bg-sev-warning/5',
  success: 'bg-score-good/5',
  info:    'bg-sev-info/5',
};

interface Props {
  variant?: Variant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function InfoCard({ variant = 'default', title, children, className }: Props) {
  return (
    <div className={cn('rounded-lg border p-4', BORDER[variant], BG[variant], className)}>
      {title && <h3 className="text-xs font-semibold text-sf-text mb-2">{title}</h3>}
      <div className="text-xs text-sf-text-2">{children}</div>
    </div>
  );
}
