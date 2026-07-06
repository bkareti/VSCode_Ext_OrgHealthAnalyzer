import type { Severity } from '@/types';
import { cn } from '@/lib/cn';
import { SEV_CLASS, SEV_LABEL } from '@/constants/severity';

export default function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
        SEV_CLASS[severity]
      )}
    >
      {SEV_LABEL[severity]}
    </span>
  );
}
