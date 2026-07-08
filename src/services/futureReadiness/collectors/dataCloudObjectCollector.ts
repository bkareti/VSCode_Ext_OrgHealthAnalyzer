import { SalesforceService } from '../../salesforceService';
import { DataCloudIdentityCounts } from '../../../types/futureReadiness';

/** Wraps SalesforceService.getDataCloudIdentityCounts with the collector-layer try/catch contract. */
export async function collectDataCloudIdentityCounts(sf: SalesforceService): Promise<DataCloudIdentityCounts | undefined> {
  try {
    return await sf.getDataCloudIdentityCounts();
  } catch {
    return undefined;
  }
}

/** Counts configured Data Cloud Data Streams (ingestion sources). 0 = no ingestion configured yet. */
export async function collectDataStreamCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Id: string }>('SELECT Id FROM DataStreamDefinition LIMIT 200');
    return rows.length;
  } catch {
    // DataStreamDefinition not available on this org/edition (Data Cloud not provisioned).
    return 0;
  }
}

/** Counts CRM/data connectors registered to Data Cloud. 0 = no connector established. */
export async function collectDataConnectorCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Id: string }>('SELECT Id FROM DataConnector LIMIT 1');
    return rows.length;
  } catch {
    return 0;
  }
}

/** Counts Calculated Insights defined in Data Cloud. 0 = no derived/activation-ready metrics yet. */
export async function collectCalculatedInsightCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Id: string }>('SELECT Id FROM CalculatedInsight LIMIT 1');
    return rows.length;
  } catch {
    return 0;
  }
}

/** Counts Data Cloud Segments defined. 0 = no activation-ready audiences yet. */
export async function collectDataSegmentCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Id: string }>('SELECT Id FROM Segment LIMIT 1');
    return rows.length;
  } catch {
    return 0;
  }
}

/** Counts Data Cloud Data Spaces (tenant/governance partitions). 0 = single default space or not provisioned. */
export async function collectDataSpaceCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Id: string }>('SELECT Id FROM DataSpace LIMIT 1');
    return rows.length;
  } catch {
    return 0;
  }
}
