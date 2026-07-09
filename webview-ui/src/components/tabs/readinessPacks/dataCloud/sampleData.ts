/**
 * Illustrative-only placeholder data for the "Data Cloud Use Case Readiness"
 * table. No collector currently computes a per-use-case readiness percentage,
 * so these rows are sample data — every consumer must render a `SampleMark`
 * alongside them. Revisit once product defines a real per-use-case formula.
 */
export interface DataCloudUseCase {
  name: string;
  readinessPct: number;
  status: 'Ready' | 'Good' | 'Moderate' | 'At Risk';
}

export const DATA_CLOUD_USE_CASES: DataCloudUseCase[] = [
  { name: '360° Customer View', readinessPct: 88, status: 'Ready' },
  { name: 'Real-time Customer Insights', readinessPct: 72, status: 'Good' },
  { name: 'Journey Orchestration', readinessPct: 64, status: 'Moderate' },
  { name: 'Personalization', readinessPct: 70, status: 'Good' },
  { name: 'Audience Activation', readinessPct: 62, status: 'Moderate' },
  { name: 'AI / Einstein Insights', readinessPct: 68, status: 'Moderate' },
];
