import StatCard from '@/components/common/StatCard';
import KVRow from './KVRow';
import SecurityPanel from './SecurityPanel';
import { fmt, encryptedFieldsTotal } from './derivations';
import { DATA_CLASSIFICATION_SAMPLE, DATA_PROTECTION_SAMPLE } from './sampleData';
import type { AnalysisResult } from '@/types';

interface Props {
  results: AnalysisResult;
}

export default function DataProtectionTab({ results }: Props) {
  const encryptedFields = encryptedFieldsTotal(results.dataModelStats);
  const piiFields = results.securityCollectorData?.piiSensitiveFieldCount;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="🔒" value={fmt(encryptedFields)} label="Encrypted Fields" sub="Classic (non-Shield) encryption" />
        <StatCard icon="🪪" value={fmt(piiFields)} label="PII Detected Fields" sub="Account/Contact/Case/Opportunity/Lead only" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SecurityPanel
          title="Data Classification Overview"
          sample
          sampleNote="PII Detected Fields is real (limited to 5 key objects); sensitivity labels and classification coverage aren't tracked yet."
        >
          <KVRow label="Data Sensitivity Labels" value={DATA_CLASSIFICATION_SAMPLE.dataSensitivityLabels} sample />
          <KVRow label="Classified Records"      value={fmt(DATA_CLASSIFICATION_SAMPLE.classifiedRecords)} sample />
          <KVRow label="PII Detected Fields"     value={fmt(piiFields)} />
          <KVRow label="Sensitive Objects"       value={DATA_CLASSIFICATION_SAMPLE.sensitiveObjects} sample />
          <KVRow label="Unclassified Objects"    value={DATA_CLASSIFICATION_SAMPLE.unclassifiedObjects} sample />
        </SecurityPanel>

        <SecurityPanel
          title="Data Protection Overview"
          sample
          sampleNote="Encrypted Fields is real; Shield-related protections and Event Monitoring/Audit Trail status aren't queryable yet."
        >
          <KVRow label="Encrypted Fields"            value={fmt(encryptedFields)} />
          <KVRow label="Encrypted Files"              value={DATA_PROTECTION_SAMPLE.encryptedFiles} sample />
          <KVRow label="Platform Encryption"          value={DATA_PROTECTION_SAMPLE.platformEncryption ? 'Enabled' : 'Disabled'} sample />
          <KVRow label="Shield Platform Encryption"   value={DATA_PROTECTION_SAMPLE.shieldPlatformEncryption ? 'Enabled' : 'Disabled'} sample />
          <KVRow label="Data Mask"                    value={DATA_PROTECTION_SAMPLE.dataMask ? 'Enabled' : 'Disabled'} sample />
          <KVRow label="Event Monitoring"             value={DATA_PROTECTION_SAMPLE.eventMonitoring ? 'Enabled' : 'Disabled'} sample />
          <KVRow label="Audit Trail"                  value={DATA_PROTECTION_SAMPLE.auditTrail ? 'Enabled' : 'Disabled'} sample />
        </SecurityPanel>
      </div>
    </div>
  );
}
