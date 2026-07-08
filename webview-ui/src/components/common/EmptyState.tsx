import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center py-12 px-6',
        className
      )}
    >
      {icon && (
        <span className="text-3xl text-sf-muted" aria-hidden>
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-sf-text">{title}</p>
      {description && (
        <p className="text-xs text-sf-muted max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
