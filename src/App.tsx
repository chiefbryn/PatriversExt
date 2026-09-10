import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import { ConnectivityProvider } from '@/hooks/useConnectivity';
import { AppLayout } from '@/components/AppLayout';
import { ForcePasswordChange } from '@/components/ForcePasswordChange';
import { OtpGate } from '@/components/OtpGate';
import { IdleScreensaver } from '@/components/IdleScreensaver';
import { AppShellSkeleton, ContentSkeleton } from '@/components/LoadingSkeletons';
import { DEFAULT_ROUTE, NAV_ITEMS, type AppRole } from '@/lib/roles';

import PublicHome from '@/pages/PublicHome';

// Staff-only code is split by route and only downloaded once the user reaches it.
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const POS = lazy(() => import('@/pages/POS'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const PriceList = lazy(() => import('@/pages/PriceList'));
const Stock = lazy(() => import('@/pages/Stock'));
const StockByDate = lazy(() => import('@/pages/StockByDate'));
const StockCount = lazy(() => import('@/pages/StockCount'));
const Documents = lazy(() => import('@/pages/Documents'));
const Reports = lazy(() => import('@/pages/Reports'));
const UsersAndSecurity = lazy(() => import('@/pages/UsersAndSecurity'));
const PaymentTypes = lazy(() => import('@/pages/PaymentTypes'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const MyDocuments = lazy(() => import('@/pages/MyDocuments'));
const Requisitions = lazy(() => import('@/pages/Requisitions'));
const MySales = lazy(() => import('@/pages/MySales'));
const GoodsReceived = lazy(() => import('@/pages/GoodsReceived'));
const ExpenseTypes = lazy(() => import('@/pages/ExpenseTypes'));
const Outlets = lazy(() => import('@/pages/Outlets'));
const Availability = lazy(() => import('@/pages/Availability'));
const CeoDashboard = lazy(() => import('@/pages/ceo/CeoDashboard'));
const BranchStock = lazy(() => import('@/pages/ceo/BranchStock'));
const Transfers = lazy(() => import('@/pages/Transfers'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Returning to a module reuses cached data instantly and refreshes quietly
      // in the background instead of blocking on a fresh round trip.
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ALL_ROLES: AppRole[] = ['admin', 'ceo', 'pharmacist', 'cashier'];

function rolesFor(path: string): AppRole[] {
  const item = NAV_ITEMS.find(n => n.path === path);
  return item ? item.roles : ALL_ROLES;
}

function RequireRole({ role, allowed, children }: { role: AppRole; allowed: AppRole[]; children: JSX.Element }) {
  return allowed.includes(role) ? children : <Navigate to={DEFAULT_ROUTE[role]} replace />;
}

function guarded(role: AppRole, path: string, element: JSX.Element) {
  return <RequireRole role={role} allowed={rolesFor(path)}>{element}</RequireRole>;
}

function AppRoutes() {
  const { user, role, profile, loading, isIdle, signOut, otpRequired } = useAuth();

  if (loading) {
    return <AppShellSkeleton />;
  }

  if (!user) {
    return (
      <Suspense fallback={<AppShellSkeleton />}>
        <Routes>
          <Route path="/" element={<PublicHome />} />
          <Route path="/system" element={<Login />} />
          <Route path="/system/*" element={<Login />} />
          <Route path="*" element={<PublicHome />} />
        </Routes>
      </Suspense>
    );
  }

  // Force password change
  if (profile?.must_change_password) {
    return <ForcePasswordChange />;
  }

  // 2FA gate (admin/CEO with OTP enabled)
  if (otpRequired) {
    return <OtpGate />;
  }

  // If user has no role assigned, show a message
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 px-4">
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold text-foreground mb-2">No role assigned</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Your account does not have a role. Please contact a system administrator.
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-primary underline hover:text-primary/80"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {isIdle && <IdleScreensaver />}
      <Suspense fallback={<ContentSkeleton />}>
        <Routes>
          <Route path="/" element={<PublicHome />} />
          <Route element={<AppLayout role={role} userName={profile?.full_name || 'User'} onLogout={signOut} />}>
            <Route path="/system" element={<Navigate to={DEFAULT_ROUTE[role]} replace />} />
            <Route path="/ceo" element={guarded(role, '/ceo', <CeoDashboard />)} />
            <Route path="/ceo/stock" element={guarded(role, '/ceo/stock', <BranchStock />)} />
            <Route path="/transfers" element={guarded(role, '/transfers', <Transfers />)} />
            <Route path="/dashboard" element={guarded(role, '/dashboard', <Dashboard />)} />
            <Route path="/pos" element={guarded(role, '/pos', <POS />)} />
            <Route path="/inventory" element={guarded(role, '/inventory', <Inventory />)} />
            <Route path="/price-list" element={guarded(role, '/price-list', <PriceList />)} />
            <Route path="/stock" element={guarded(role, '/stock', <Stock />)} />
            <Route path="/stock-by-date" element={guarded(role, '/stock-by-date', <StockByDate />)} />
            <Route path="/stock-control" element={guarded(role, '/stock-control', <StockCount />)} />
            <Route path="/documents" element={guarded(role, '/documents', <Documents />)} />
            <Route path="/goods-received" element={guarded(role, '/goods-received', <GoodsReceived />)} />
            <Route path="/expense-types" element={guarded(role, '/expense-types', <ExpenseTypes />)} />
            <Route path="/my-documents" element={guarded(role, '/my-documents', <MyDocuments />)} />
            <Route path="/reports" element={guarded(role, '/reports', <Reports />)} />
            <Route path="/users" element={guarded(role, '/users', <UsersAndSecurity />)} />
            <Route path="/payment-types" element={guarded(role, '/payment-types', <PaymentTypes />)} />
            <Route path="/requisitions" element={guarded(role, '/requisitions', <Requisitions />)} />
            <Route path="/my-sales" element={guarded(role, '/my-sales', <MySales />)} />
            <Route path="/settings" element={guarded(role, '/settings', <SettingsPage />)} />
            <Route path="/outlets" element={guarded(role, '/outlets', <Outlets />)} />
            <Route path="/availability" element={guarded(role, '/availability', <Availability />)} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ConnectivityProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ConnectivityProvider>
  </QueryClientProvider>
);

export default App;
