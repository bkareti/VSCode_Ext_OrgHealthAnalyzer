import { useMemo } from 'react';
import StatCard from '@/components/common/StatCard';
import GlassCard from '@/components/common/GlassCard';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import KVRow from './KVRow';
import SecurityPanel from './SecurityPanel';
import { fmt } from './derivations';
import { SHIELD_STATUS_SAMPLE } from './sampleData';
import type { AnalysisResult } from '@/types';

interface Props {
  results: AnalysisResult;
}

export default function ShieldEncryptionTab({ results }: Props) {
  const integ = results.orgInfoData?.integrations;
  const entryPoints = results.entryPoints ?? [];

  const integrationIssues = useMemo(
    () => (results.issues ?? []).filter((i) => i.category === 'integration'),
    [results],
  );

  return (
    <div className="space-y-4">
      {integ && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon="🔐" value={fmt(integ.namedCredentials)}    label="Named Credentials" />
          <StatCard icon="🗝️" value={fmt(integ.externalCredentials)} label="External Credentials" />
          <StatCard icon="🌐" value={fmt(integ.remoteSites)}         label="Remote Sites" />
          <StatCard icon="📜" value={fmt(integ.certificates)}        label="Certificates" />
        </div>
      )}

      <SecurityPanel
        title="Salesforce Shield Status"
        sample
        sampleNote="OrgPulse doesn't yet query Shield product configuration (Platform Encryption, Field Audit Trail, Transaction Security, Data Mask, Key Management)."
      >
        <KVRow label="Platform Encryption"       value={SHIELD_STATUS_SAMPLE.platformEncryption ? 'Enabled' : 'Disabled'} />
        <KVRow label="Field Audit Trail"         value={SHIELD_STATUS_SAMPLE.fieldAuditTrail ? 'Enabled' : 'Disabled'} />
        <KVRow label="Shield Event Monitoring"   value={SHIELD_STATUS_SAMPLE.shieldEventMonitoring ? 'Enabled' : 'Disabled'} />
        <KVRow label="Transaction Security"      value={SHIELD_STATUS_SAMPLE.transactionSecurity ? 'Enabled' : 'Disabled'} />
        <KVRow label="Data Mask"                 value={SHIELD_STATUS_SAMPLE.dataMask ? 'Enabled' : 'Disabled'} />
        <KVRow label="Key Management"            value={SHIELD_STATUS_SAMPLE.keyManagement} />
      </SecurityPanel>

      {entryPoints.length > 0 && (
        <GlassCard title={`Public Apex Entry Points (${entryPoints.length})`}>
          <p className="text-[11px] text-sf-muted mb-2">
            Apex classes exposed as REST resources or inbound email handlers. Review sharing and input validation on each.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border bg-sf-bg-3">
                  {['Class', 'Type', 'Annotation'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entryPoints.map((ep, i) => (
                  <tr key={`${ep.name}-${i}`} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                    <td className="px-3 py-1.5 text-sf-text font-mono text-[11px]">{ep.name}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        ep.type === 'RestResource'
                          ? 'bg-sf-accent/10 text-sf-accent'
                          : 'bg-sev-warning/10 text-sev-warning'
                      }`}>
                        {ep.type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-sf-muted font-mono text-[11px] truncate max-w-80" title={ep.annotation}>{ep.annotation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <GlassCard title="Integration Issues">
        <IssueFilters />
        <IssueTable issues={integrationIssues} />
      </GlassCard>
    </div>
  );
}
