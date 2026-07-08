import { ReadinessSignal, PackId } from '../../types/futureReadiness';

/** Builds a readiness signal with sensible defaults for scoring tests. */
export function signal(overrides: Partial<ReadinessSignal> = {}): ReadinessSignal {
  return {
    id: 'check-1',
    packId: 'ai-agentforce' as PackId,
    dimension: 'Dim A',
    status: 'partial',
    score: 60,
    weight: 10,
    evidence: ['some evidence'],
    ...overrides,
  };
}
