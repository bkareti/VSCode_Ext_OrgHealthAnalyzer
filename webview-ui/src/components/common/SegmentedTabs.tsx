import { cn } from '@/lib/cn';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  /** Optional trailing count badge, e.g. "Failed (4)". */
  count?: number;
}

interface Props<T extends string> {
  items: SegmentedTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** 'md' for top-level page tabs, 'sm' for inline filter pills. */
  size?: 'sm' | 'md';
  /** 'underline' matches the classic tab-bar look; 'pill' matches rounded filter buttons. */
  variant?: 'underline' | 'pill';
  className?: string;
}

/** Generic pill/underline tab bar — reused for top-level page tabs and inline status filters. */
export default function SegmentedTabs<T extends string>({
  items,
  active,
  onChange,
  size = 'md',
  variant = 'underline',
  className,
}: Props<T>) {
  const sizeCls = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-1.5 text-xs';

  return (
    <div className={cn('flex items-center flex-wrap', variant === 'pill' ? 'gap-1.5' : 'gap-0', className)}>
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              sizeCls,
              'font-medium transition-colors whitespace-nowrap',
              variant === 'underline'
                ? cn(
                    'border-b-2',
                    isActive ? 'border-sf-accent text-sf-text' : 'border-transparent text-sf-muted hover:text-sf-text'
                  )
                : cn(
                    'rounded-full border',
                    isActive
                      ? 'bg-sf-accent/15 border-sf-accent/30 text-sf-accent'
                      : 'bg-sf-bg-2 border-sf-border text-sf-muted hover:text-sf-text'
                  )
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('ml-1 tabular-nums', isActive ? 'opacity-90' : 'opacity-60')}>
                ({item.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
