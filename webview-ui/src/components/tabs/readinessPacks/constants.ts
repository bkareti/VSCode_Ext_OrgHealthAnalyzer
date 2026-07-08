import type { PackId } from '@/types';

export const PACK_TABS: { id: PackId; label: string }[] = [
  { id: 'data-cloud', label: 'Data Cloud Readiness' },
  { id: 'ai-agentforce', label: 'Agentforce Readiness' },
  { id: 'hyperforce', label: 'Hyperforce Readiness' },
];

/** One static, evergreen sentence per pack — the "why these prerequisites matter" tail
 *  used by the AI Readiness Summary panel's fallback (non-AI) template. */
export const PACK_SUMMARY_TAIL: Record<PackId, string> = {
  'data-cloud': 'before customer data can be reliably ingested, unified, and activated in Data Cloud.',
  'ai-agentforce': 'before Agentforce agents can safely take autonomous action on your data.',
  'hyperforce': 'before your org can safely migrate to Hyperforce.',
};
