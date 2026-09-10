import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X, Maximize, Minimize } from 'lucide-react';
import { AppSidebar } from './AppSidebar';
import { useFullscreen } from '@/hooks/useFullscreen';
import { Button } from '@/components/ui/button';
import { SyncStatus } from '@/components/SyncStatus';
import type { AppRole } from '@/lib/roles';

interface AppLayoutProps {
  role: AppRole;
  userName: string;
  onLogout: () => void;
}

export function AppLayout({ role, userName, onLogout }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  return (
    <div className="min-h-screen flex w-full relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, slide-in on toggle */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0 lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <AppSidebar role={role} userName={userName} onLogout={() => { onLogout(); setSidebarOpen(false); }} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-secondary/30 min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-card border-b px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors lg:hidden"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="text-sm font-semibold text-primary lg:hidden">Patrivers Pharmacy</span>
          </div>
          <div className="flex items-center gap-1">
            <SyncStatus />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="h-8 w-8"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
