import type { ReactNode } from 'react';

interface RightColumn {
  label: string;
  value: ReactNode;
  colClassName?: string;
}

interface Props {
  index: number;
  colorClass: string; // Tailwind bg/text classes for the numbered circle
  title: string;
  description: string;
  rightColumns: RightColumn[];
}

/** Shared numbered-row layout used by Top Business Risks and Top Opportunities. */
export default function RankedListItem({
  index,
  colorClass,
  title,
  description,
  rightColumns,
}: Props) {
  return (
    <li className="flex items-center gap-3 border-b border-sf-border/30 py-2 last:border-0">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${colorClass}`}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-sf-text">{title}</p>
        <p className="text-[10px] leading-snug text-sf-muted">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {rightColumns.map((col) => (
          <div
            key={col.label}
            className={`flex items-center justify-center ${col.colClassName ?? ''}`}
          >
            {col.value}
          </div>
        ))}
      </div>
    </li>
  );
}
