import { SalesforceService } from '../../salesforceService';
import { RemoteSiteDetail, CertificateDetail } from '../../../types/futureReadiness';

/** Collects Remote Site Settings with endpoint + protocol detail (Tooling API). */
export async function collectRemoteSites(sf: SalesforceService): Promise<RemoteSiteDetail[]> {
  try {
    const rows = await sf.toolingQuery<{ SiteName?: string; EndpointUrl?: string; IsActive?: boolean }>(
      'SELECT SiteName, EndpointUrl, IsActive FROM RemoteProxy LIMIT 500',
    );
    return rows.map((r) => {
      const endpoint = r.EndpointUrl ?? '';
      return {
        name: r.SiteName ?? endpoint,
        endpoint,
        isActive: r.IsActive ?? true,
        isHttp: /^http:\/\//i.test(endpoint),
      };
    });
  } catch {
    return [];
  }
}

/** Collects Certificates with expiry + key-size detail (Tooling API). */
export async function collectCertificates(sf: SalesforceService): Promise<CertificateDetail[]> {
  try {
    const rows = await sf.toolingQuery<{ MasterLabel?: string; DeveloperName?: string; ExpirationDate?: string; KeySize?: number }>(
      'SELECT DeveloperName, MasterLabel, ExpirationDate, KeySize FROM Certificate LIMIT 200',
    );
    const now = Date.now();
    return rows.map((r) => {
      const daysUntilExpiry = r.ExpirationDate
        ? Math.round((new Date(r.ExpirationDate).getTime() - now) / 86_400_000)
        : undefined;
      return {
        name: r.MasterLabel ?? r.DeveloperName ?? 'Certificate',
        expirationDate: r.ExpirationDate,
        keySize: r.KeySize,
        daysUntilExpiry,
      };
    });
  } catch {
    return [];
  }
}
