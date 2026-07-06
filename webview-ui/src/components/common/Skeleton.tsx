import { cn } from '@/lib/cn';

interface Props {
  className?: string;
  /** Render multiple stacked rows */
  rows?: number;
  rowClassName?: string;
}

export default function Skeleton({ className, rows, rowClassName }: Props) {
  if (rows) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn('h-3 rounded bg-sf-bg-3 animate-pulse', rowClassName)}
            style={{ width: `${85 - (i % 3) * 15}%` }}
          />
        ))}
      </div>
    );
  }

  return <div className={cn('rounded bg-sf-bg-3 animate-pulse', className)} />;
}
