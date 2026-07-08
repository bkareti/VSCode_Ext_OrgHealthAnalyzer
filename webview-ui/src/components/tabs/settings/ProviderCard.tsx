import type { ReactNode } from 'react';
import GlassCard from '@/components/common/GlassCard';

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-score-good/30 bg-score-good/15 px-2 py-0.5 text-[10px] font-semibold text-score-good">
      <span className="h-1.5 w-1.5 rounded-full bg-score-good" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-sf-border bg-sf-bg-3 px-2 py-0.5 text-[10px] font-semibold text-sf-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-sf-muted/60" />
      Not Connected
    </span>
  );
}

interface Props {
  icon: ReactNode;
  iconBg: string;
  name: string;
  description: string;
  connected: boolean;
  children: ReactNode;
}

/** Shared chrome for an AI provider card: icon, name, description, status badge. */
export default function ProviderCard({ icon, iconBg, name, description, connected, children }: Props) {
  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <span className="text-lg">{icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-sf-text">{name}</p>
            <p className="text-[10px] text-sf-muted">{description}</p>
          </div>
        </div>
        <StatusBadge connected={connected} />
      </div>
      {children}
    </GlassCard>
  );
}
