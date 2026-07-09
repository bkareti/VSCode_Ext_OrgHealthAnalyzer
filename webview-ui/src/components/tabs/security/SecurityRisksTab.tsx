import { useMemo } from 'react';
import GlassCard from '@/components/common/GlassCard';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import { SEC_CATS } from './derivations';
import type { AnalysisResult } from '@/types';

interface Props {
  results: AnalysisResult;
}

export default function SecurityRisksTab({ results }: Props) {
  const secIssues = useMemo(
    () => (results.issues ?? []).filter((i) => SEC_CATS.includes(i.category)),
    [results],
  );

  return (
    <GlassCard title={`Security Issues (${secIssues.length})`}>
      <IssueFilters />
      <IssueTable issues={secIssues} />
    </GlassCard>
  );
}
