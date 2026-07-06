import { create } from 'zustand';

export type TabId =
  | 'overview'
  | 'orginfo'
  | 'datamodel'
  | 'code'
  | 'perflimits'
  | 'govlimits'
  | 'secaccess'
  | 'futurereadiness'
  | 'cta'
  | 'askarchitect'
  | 'trendshistory'
  | 'reports'
  | 'settings';

export type SecurityMode = 'safe' | 'standard' | 'advanced';

interface UIStore {
  securityMode: SecurityMode | null;
  selectedModelId: string | null;
  showAnalysisDialog: boolean;
  sideNavCollapsed: boolean;
  setSecurityMode: (mode: SecurityMode) => void;
  setSelectedModelId: (id: string) => void;
  setShowAnalysisDialog: (v: boolean) => void;
  toggleSideNav: () => void;
}

function readPersistedModelId(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vscode = (window as any).__vscodeApi;
    if (vscode) return (vscode.getState() as { selectedModelId?: string })?.selectedModelId ?? null;
  } catch {
    // outside webview
  }
  return null;
}

export const useUIStore = create<UIStore>(() => ({
  securityMode: null,
  selectedModelId: readPersistedModelId(),
  showAnalysisDialog: false,
  sideNavCollapsed: false,
  setSecurityMode: (securityMode) => useUIStore.setState({ securityMode }),
  setSelectedModelId: (selectedModelId) => useUIStore.setState({ selectedModelId }),
  setShowAnalysisDialog: (showAnalysisDialog) => useUIStore.setState({ showAnalysisDialog }),
  toggleSideNav: () => useUIStore.setState((s) => ({ sideNavCollapsed: !s.sideNavCollapsed })),
}));
