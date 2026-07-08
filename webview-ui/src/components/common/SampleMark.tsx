import Tooltip from './Tooltip';
import { cn } from '@/lib/cn';

interface Props {
  note?: string;
  className?: string;
}

const DEFAULT_NOTE = 'This card includes sample data — the underlying metric isn\'t tracked by OrgPulse yet.';

// Formalizes the existing ad-hoc "◎" demo-data convention (see OrgInfo.tsx's
// `isDemo ? ' ◎' : ''`) into a small, discoverable, tooltip-enabled marker.
export default function SampleMark({ note = DEFAULT_NOTE, className }: Props) {
  return (
    <Tooltip content={note}>
      <span
        className={cn('text-[10px] text-sf-muted/80 cursor-help select-none', className)}
        aria-label="Sample data"
      >
        ◎
      </span>
    </Tooltip>
  );
}
