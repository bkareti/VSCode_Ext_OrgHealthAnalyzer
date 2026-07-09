import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { NAV_GROUPS } from '@/constants/tabs';
import type { NavItem } from '@/constants/tabs';
import { useUIStore } from '@/store/slices/uiStore';
import { useOrgStore } from '@/store/slices/orgStore';

export default function SideNav() {
  const collapsed = useUIStore((s) => s.sideNavCollapsed);
  const toggle = useUIStore((s) => s.toggleSideNav);
  const location = useLocation();
  const results = useOrgStore((s) => s.results);
  const iconUri = (window as Window & { ORGPULSE_ICON_URI?: string }).ORGPULSE_ICON_URI;

  const orgName =
    results?.orgDetails?.orgName ?? results?.metadata?.orgAlias ?? results?.metadata?.orgId ?? null;
  const orgEdition = results?.orgDetails?.orgType ?? null;
  const apiVersion = results?.orgDetails?.apiVersion ?? results?.metadata?.apiVersion ?? null;
  const isProduction = orgEdition ? !/(sandbox|developer|scratch)/i.test(orgEdition) : null;

  // Items whose path carries a query string need pathname AND search compared.
  const isQueryScopedActive = (path: string): boolean => {
    const [pathname, search] = path.split('?');
    return location.pathname === pathname && location.search === `?${search}`;
  };

  // matchExact items (e.g. Future Readiness Overview) are active only when pathname
  // matches AND there are no search params — preventing all 4 FR items from being
  // highlighted when a pack is selected.
  const isExactActive = (path: string): boolean =>
    location.pathname === path && location.search === '';

  const resolveActive = (item: NavItem, routerIsActive: boolean): boolean => {
    if (item.matchExact) return isExactActive(item.path);
    if (item.path.includes('?')) return isQueryScopedActive(item.path);
    return routerIsActive;
  };

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r border-white/10 bg-sf-nav-bg transition-all duration-200',
        collapsed ? 'w-13' : 'w-55'
      )}
    >
      {/* Logo / branding */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-2.5 border-b border-white/10 px-3 py-3',
          collapsed && 'justify-center'
        )}
      >
        {iconUri ? (
          <img src={iconUri} alt="OrgPulse" className="h-6 w-6 shrink-0 rounded" />
        ) : (
          <span className="shrink-0 text-base">🌐</span>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold text-white">OrgPulse</p>
            <p className="truncate text-[10px] leading-tight text-slate-400">
              AI-Powered Org Intelligence
            </p>
          </div>
        )}
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 scrollbar-none overflow-x-hidden overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            {/* Group header */}
            {!collapsed && (
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase select-none">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mx-2 my-1 border-t border-white/10" />}

            {/* Nav items */}
            {group.items.map((item) =>
              item.disabled ? (
                <span
                  key={item.id}
                  title={collapsed ? `${item.label} (coming soon)` : 'Coming soon'}
                  className={cn(
                    'mx-1.5 my-0.5 flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-1.5 opacity-35 select-none',
                    collapsed ? 'justify-center' : ''
                  )}
                >
                  <span
                    role="img"
                    aria-hidden
                    className={cn('shrink-0 leading-none', collapsed ? 'text-xl' : 'text-sm')}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-sm text-slate-400">{item.label}</span>
                      <span className="shrink-0 rounded bg-white/10 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-slate-400">
                        SOON
                      </span>
                    </>
                  )}
                </span>
              ) : (
                <NavLink
                  key={item.id}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => {
                    const active = resolveActive(item, isActive);
                    return cn(
                      'mx-1.5 my-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                      collapsed ? 'justify-center' : '',
                      active
                        ? 'bg-blue-500/20 font-medium text-blue-300'
                        : 'text-slate-400 hover:bg-white/[0.07] hover:text-slate-100'
                    );
                  }}
                >
                  <span
                    role="img"
                    aria-hidden
                    className={cn('shrink-0 leading-none', collapsed ? 'text-xl' : 'text-sm')}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="shrink-0 rounded bg-blue-500/25 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-blue-300">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              )
            )}
          </div>
        ))}
      </nav>

      {/* Current org info card — visible when expanded and org data is loaded */}
      {!collapsed && orgName && (
        <div className="mx-2 mb-2 shrink-0 rounded-lg border border-white/10 bg-white/4 p-3">
          <p className="mb-1.5 text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
            Current Org
          </p>
          <div className="mb-0.5 flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                isProduction === null
                  ? 'bg-slate-500'
                  : isProduction
                    ? 'bg-green-400'
                    : 'bg-amber-400'
              )}
            />
            <p className="truncate text-xs font-semibold text-slate-200">{orgName}</p>
          </div>
          {orgEdition && (
            <p className="mb-2 ml-3 text-[10px] text-slate-500">
              {isProduction
                ? 'Production'
                : orgEdition.includes('Sandbox')
                  ? 'Sandbox'
                  : orgEdition}
            </p>
          )}
          <div className="space-y-0.5">
            {apiVersion && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">API Version</span>
                <span className="font-medium text-slate-300">{apiVersion}</span>
              </div>
            )}
            {orgEdition && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">Org Edition</span>
                <span className="max-w-22.5 truncate text-right font-medium text-slate-300">
                  {orgEdition.split(' ')[0]}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="flex shrink-0 justify-end border-t border-white/10 p-2">
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          <svg
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              collapsed ? 'rotate-180' : ''
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
