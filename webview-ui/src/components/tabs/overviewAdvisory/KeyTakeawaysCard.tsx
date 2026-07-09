import { GlassCard, SampleMark } from '@/components/common';

export default function KeyTakeawaysCard({ takeaways }: { takeaways: string[] }) {
  return (
    <GlassCard className="flex-1 min-w-64">
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Key Takeaways</h3>
        <SampleMark />
      </div>
      <ul className="space-y-1.5">
        {takeaways.map((t) => (
          <li key={t} className="flex items-start gap-1.5 text-[11px] text-sf-text leading-snug">
            <span className="text-score-good shrink-0 mt-0.5">✓</span>
            {t}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
