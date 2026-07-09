import { GlassCard, SampleMark } from '@/components/common';

interface Props {
  opinionText: string;
  priorityRecommendation: string;
  byline: string;
}

export default function AiAdvisorOpinionCard({ opinionText, priorityRecommendation, byline }: Props) {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">AI Advisor Opinion</h3>
        <SampleMark />
      </div>
      <span className="text-2xl text-sf-accent/40 font-serif leading-none">“</span>
      <p className="text-[11px] text-sf-text italic leading-snug -mt-2">{opinionText}</p>
      <div className="mt-3 p-2.5 rounded-lg bg-sf-bg-2 border border-sf-border">
        <p className="text-[10px] font-semibold text-sf-text mb-0.5">Priority Recommendation</p>
        <p className="text-[10px] text-sf-muted leading-snug">{priorityRecommendation}</p>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <div className="w-6 h-6 rounded-full bg-sf-accent/20 flex items-center justify-center text-[10px] font-bold text-sf-accent shrink-0">
          AI
        </div>
        <p className="text-[10px] text-sf-muted">{byline}</p>
      </div>
    </GlassCard>
  );
}
