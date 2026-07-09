import { GlassCard, SampleMark } from '@/components/common';

export default function AICtoSummaryCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">⭐</span>
        <h3 className="text-xs font-semibold text-sf-text">AI CTO Summary</h3>
        <SampleMark note="This narrative summary is illustrative — OrgPulse does not yet generate an AI-authored debt summary." />
      </div>
      <p className="text-[11px] text-sf-muted leading-relaxed">
        Your org has a <strong className="text-sf-text">Moderate</strong> level of technical debt primarily driven
        by legacy automation, custom code complexity, and configuration sprawl. Addressing the top 10 critical
        items can significantly improve maintainability, security, and future readiness.
      </p>
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View full summary →
      </span>
    </GlassCard>
  );
}
