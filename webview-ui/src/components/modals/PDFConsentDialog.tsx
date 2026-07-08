import { useVSCode } from '@/hooks/useVSCode';
import { useDashboardStore } from '@/store/dashboardStore';

interface Props {
  onClose: () => void;
}

export default function PDFConsentDialog({ onClose }: Props) {
  const { postMessage } = useVSCode();
  const results         = useDashboardStore((s) => s.results);

  const handleWithAI = () => {
    postMessage({ command: 'generateAiPdfReport', results });
    onClose();
  };

  const handleWithout = () => {
    // PDF without AI — just trigger browser print on the CTA HTML
    window.print();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-sf-bg-2 border border-sf-border rounded-xl shadow-glass w-full max-w-sm mx-4 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-sf-text">Generate PDF Report</h2>
        <p className="text-xs text-sf-muted">
          Would you like to include an AI-generated executive summary in the PDF?
          This will send analysis metadata (no org data) to your configured AI model.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleWithAI}
            className="flex-1 py-2 text-xs rounded bg-sf-accent text-white hover:opacity-90 transition-opacity"
          >
            Yes, include AI summary
          </button>
          <button
            type="button"
            onClick={handleWithout}
            className="flex-1 py-2 text-xs rounded border border-sf-border text-sf-text-2 hover:text-sf-text transition-colors"
          >
            No, export now
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full text-xs text-sf-muted hover:text-sf-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
