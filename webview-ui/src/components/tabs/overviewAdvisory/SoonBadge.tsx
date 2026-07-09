import type { ReactNode } from 'react';
import { Badge } from '@/components/common';
import { cn } from '@/lib/cn';

/** Small "Soon" pill for features that are visually complete but not yet wired up. */
export function SoonBadge({ className }: { className?: string }) {
  return (
    <Badge variant="accent" className={cn('absolute -top-2 -right-2 shadow-sm', className)}>
      Soon
    </Badge>
  );
}

/** Wraps any disabled action control (button or card) with a pinned SoonBadge. */
export function DisabledWithSoon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative opacity-60 cursor-not-allowed', className)}>
      <div className="pointer-events-none">{children}</div>
      <SoonBadge />
    </div>
  );
}
