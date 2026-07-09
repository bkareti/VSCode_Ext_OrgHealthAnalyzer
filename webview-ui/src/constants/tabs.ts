import type { TabId } from '@/store/slices/uiStore';

export interface NavItem {
  id: TabId;
  label: string;
  icon: string;
  path: string;
  /** Optional badge text rendered as a pill (e.g. "AI") */
  badge?: string;
  /** When true, item is active only when pathname matches AND location.search is empty */
  matchExact?: boolean;
  disabled?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'EXECUTIVE',
    items: [
      { id: 'overview',      label: 'Executive Dashboard', icon: '🏠', path: '/overview'     },
      { id: 'cta',           label: 'OrgPulse Advisory',  icon: '✨', path: '/cta', badge: 'AI' },
      { id: 'askarchitect',  label: 'Ask Architect',       icon: '💬', path: '/askarchitect'  },
      { id: 'trendshistory', label: 'Reports & History',   icon: '📅', path: '/trendshistory' },
    ],
  },
  {
    label: 'ARCHITECTURE ASSESSMENT',
    items: [
      { id: 'orginfo',      label: 'Organization',              icon: '🏢', path: '/orginfo'      },
      { id: 'datamodel',    label: 'Data Model',                icon: '🗄️', path: '/datamodel'    },
      { id: 'automation',   label: 'Automation',                icon: '⚡', path: '/automation'   },
      { id: 'code',         label: 'Code Quality',              icon: '💻', path: '/code'         },
      { id: 'secaccess',    label: 'Security',                  icon: '🛡️', path: '/secaccess'    },
      { id: 'perflimits',   label: 'Performance & Scalability', icon: '🚀', path: '/perflimits'   },
      { id: 'integrations', label: 'Integrations',              icon: '🔗', path: '/integrations' },
      { id: 'govlimits',    label: 'Platform Capacity',         icon: '📈', path: '/govlimits'    },
      { id: 'techdebt',     label: 'Technical Debt',            icon: '🧹', path: '/techdebt'     },
    ],
  },
  {
    label: 'FUTURE READINESS',
    items: [
      { id: 'futurereadiness-overview',  label: 'Future Readiness (Overview)', icon: '🔮', path: '/futurereadiness', matchExact: true },
      { id: 'futurereadiness-hyperforce', label: 'Hyperforce Readiness',       icon: '🌐', path: '/futurereadiness?pack=hyperforce'    },
      { id: 'futurereadiness-datacloud',  label: 'Data Cloud Readiness',       icon: '☁️', path: '/futurereadiness?pack=data-cloud'    },
      { id: 'futurereadiness-agentforce', label: 'Agentforce Readiness',       icon: '🤖', path: '/futurereadiness?pack=ai-agentforce' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { id: 'settings',   label: 'Settings',              icon: '⚙️', path: '/settings'   },
      { id: 'scanconfig', label: 'Scan Configuration',    icon: '🔧', path: '/scanconfig', disabled: true },
      { id: 'aimodels',   label: 'Models / AI Providers', icon: '🧠', path: '/aimodels',   disabled: true },
      { id: 'users',      label: 'Users',                 icon: '👤', path: '/users',      disabled: true },
      { id: 'about',      label: 'About OrgPulse',        icon: 'ℹ️', path: '/about',      disabled: true },
    ],
  },
];

export const TABS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
