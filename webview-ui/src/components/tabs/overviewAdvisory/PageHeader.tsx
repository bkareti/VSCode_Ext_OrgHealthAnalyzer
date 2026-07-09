import { Badge, Button } from '@/components/common';
import { DisabledWithSoon } from './SoonBadge';

export default function PageHeader() {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-sf-text">AI Executive Advisory</h1>
          <Badge variant="accent">BETA</Badge>
        </div>
        <p className="text-xs text-sf-muted mt-0.5">
          AI-powered architecture review and strategic recommendations based on scan results and industry best practices.
        </p>
      </div>
      <DisabledWithSoon>
        <Button variant="ghost" disabled>
          🔄 Regenerate Advisory
        </Button>
      </DisabledWithSoon>
    </div>
  );
}
