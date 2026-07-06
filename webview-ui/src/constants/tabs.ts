import type { TabId } from '@/store/slices/uiStore';

export interface NavItem {
  id: TabId;
  label: string;
  icon: string;
  path: string;
  disabled?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'ORG PULSE',
    items: [
      { id: 'overview', label: 'Overview', icon: '📊', path: '/overview' },
    ],
  },
  {
    label: 'ARCHITECTURE',
    items: [
      { id: 'orginfo',    label: 'Organization',    icon: '🏢', path: '/orginfo'    },
      { id: 'datamodel',  label: 'Data Model',      icon: '🗄️', path: '/datamodel'  },
      { id: 'automation', label: 'Automation',      icon: '⚡', path: '/automation' },
      { id: 'code',       label: 'Code Quality',    icon: '💻', path: '/code'       },
      { id: 'secaccess',  label: 'Security',        icon: '🛡️', path: '/secaccess'  },
      { id: 'perflimits', label: 'Performance',     icon: '🚀', path: '/perflimits' },
      { id: 'govlimits',  label: 'Platform Limits', icon: '📈', path: '/govlimits'  },
    ],
  },
  {
    label: 'MODERNIZATION',
    items: [
      { id: 'techdebt',      label: 'Technical Debt',    icon: '🧹', path: '/techdebt'      },
      { id: 'cta',           label: 'OrgPulse Advisory', icon: '✨', path: '/cta'           },
      { id: 'futurereadiness',label: 'Future Readiness', icon: '🔮', path: '/futurereadiness'},
      { id: 'trendshistory',  label: 'Trends & History',  icon: '📅', path: '/trendshistory' },
      { id: 'askarchitect',   label: 'Ask Architect',     icon: '💬', path: '/askarchitect'   },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { id: 'reports',  label: 'Reports',  icon: '📄', path: '/reports',  disabled: true },
      { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings', disabled: true },
    ],
  },
];

export const TABS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
