import { useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, LayoutDashboard, Package, DollarSign, Warehouse,
  FileText, ClipboardList, BarChart3, Users, CreditCard, Settings,
  LogOut, FolderOpen, PackagePlus, Receipt, Tags, Store, Search, ArrowLeftRight
} from 'lucide-react';
import { useEffect } from 'react';
import { NAV_ITEMS, ROLE_LABELS, type AppRole } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { BrandMark, BRAND_NAME } from '@/components/BrandMark';
import { preloadRoute, preloadRoutesWhenIdle } from '@/lib/routeChunks';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingCart, LayoutDashboard, Package, DollarSign, Warehouse,
  FileText, ClipboardList, BarChart3, Users, CreditCard, Settings, FolderOpen,
  PackagePlus, Receipt, Tags, Store, Search, ArrowLeftRight,
};

interface AppSidebarProps {
  role: AppRole;
  userName: string;
  onLogout: () => void;
}

export function AppSidebar({ role, userName, onLogout }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role));

  // Warm the modules this role can open, so clicking one shows it immediately.
  useEffect(() => {
    preloadRoutesWhenIdle(visibleItems.map(item => item.path));
  }, [role]);

  return (
    <aside className="w-60 min-h-screen flex flex-col bg-sidebar text-sidebar-foreground shrink-0">
      {/* Header */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div>
            <h1 className="text-sm font-semibold text-sidebar-primary">{BRAND_NAME}</h1>
            <p className="text-[10px] text-sidebar-muted">Management system</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = ICON_MAP[item.icon];
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              onMouseEnter={() => preloadRoute(item.path)}
              onFocus={() => preloadRoute(item.path)}
              onTouchStart={() => preloadRoute(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" />}
              <span>{item.title}</span>
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-sidebar-primary truncate">{userName}</p>
            <p className="text-[10px] text-sidebar-muted">{ROLE_LABELS[role]}</p>
          </div>
          <button onClick={onLogout} className="p-1.5 rounded hover:bg-sidebar-accent/50 transition-colors" title="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
