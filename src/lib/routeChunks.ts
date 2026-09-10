// Central registry of route chunk loaders so the sidebar can warm a module's
// code before the user clicks it. Vite dedupes repeat dynamic imports, so
// calling a loader twice is cheap.
type Loader = () => Promise<unknown>;

export const ROUTE_LOADERS: Record<string, Loader> = {
  '/login': () => import('@/pages/Login'),
  '/dashboard': () => import('@/pages/Dashboard'),
  '/pos': () => import('@/pages/POS'),
  '/inventory': () => import('@/pages/Inventory'),
  '/price-list': () => import('@/pages/PriceList'),
  '/stock': () => import('@/pages/Stock'),
  '/stock-by-date': () => import('@/pages/StockByDate'),
  '/stock-control': () => import('@/pages/StockCount'),
  '/documents': () => import('@/pages/Documents'),
  '/reports': () => import('@/pages/Reports'),
  '/users': () => import('@/pages/UsersAndSecurity'),
  '/payment-types': () => import('@/pages/PaymentTypes'),
  '/settings': () => import('@/pages/SettingsPage'),
  '/my-documents': () => import('@/pages/MyDocuments'),
  '/requisitions': () => import('@/pages/Requisitions'),
  '/my-sales': () => import('@/pages/MySales'),
  '/goods-received': () => import('@/pages/GoodsReceived'),
  '/expense-types': () => import('@/pages/ExpenseTypes'),
  '/outlets': () => import('@/pages/Outlets'),
  '/availability': () => import('@/pages/Availability'),
  '/ceo': () => import('@/pages/ceo/CeoDashboard'),
  '/ceo/stock': () => import('@/pages/ceo/BranchStock'),
  '/transfers': () => import('@/pages/Transfers'),
};

const warmed = new Set<string>();

export function preloadRoute(path: string) {
  if (warmed.has(path)) return;
  const loader = ROUTE_LOADERS[path];
  if (!loader) return;
  warmed.add(path);
  void loader();
}

/** Warm every module the current role can reach, once the browser is idle. */
export function preloadRoutesWhenIdle(paths: string[]) {
  const run = () => paths.forEach(preloadRoute);
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 3000 });
  else window.setTimeout(run, 1200);
}
