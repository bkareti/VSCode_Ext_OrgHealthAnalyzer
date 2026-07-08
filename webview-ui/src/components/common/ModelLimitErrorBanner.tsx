import { NavLink } from 'react-router-dom';
import Button from './Button';
import InfoCard from './InfoCard';

/** Marker prefix used by the host (src/services/aiService.ts, buildTruncatedReportError) */
const MODEL_LIMIT_MARKER = 'AI response was cut off';

export function isModelLimitError(message: string | null | undefined): boolean {
  return !!message && message.includes(MODEL_LIMIT_MARKER);
}

interface Props {
  message: string;
  onRetry: () => void;
}

/** Error banner for AI generation failures — adds a model-switch shortcut when the failure was a token-limit truncation. */
export default function ModelLimitErrorBanner({ message, onRetry }: Props) {
  const limitHit = isModelLimitError(message);
  return (
    <InfoCard variant="error">
      <p>{message}</p>
      <div className="mt-2 flex items-center gap-3">
        {limitHit && (
          <NavLink to="/settings" className="font-medium text-sf-accent hover:underline">
            Choose a different model →
          </NavLink>
        )}
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    </InfoCard>
  );
}
