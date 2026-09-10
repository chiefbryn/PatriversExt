export type AppRole = 'admin' | 'ceo' | 'pharmacist' | 'cashier';

export interface NavItem {
  title: string;
  path: string;
  icon: string;
  roles: AppRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { title: 'Executive overview', path: '/ceo', icon: 'LayoutDashboard', roles: ['ceo'] },
  { title: 'Stock by branch', path: '/ceo/stock', icon: 'Store', roles: ['admin', 'ceo'] },
  { title: 'Branch transfers', path: '/transfers', icon: 'ArrowLeftRight', roles: ['admin', 'ceo', 'pharmacist', 'cashier'] },
  { title: 'POS / Sales', path: '/pos', icon: 'ShoppingCart', roles: ['admin', 'ceo', 'pharmacist', 'cashier'] },
  { title: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', roles: ['admin', 'pharmacist', 'cashier'] },
  { title: 'Inventory', path: '/inventory', icon: 'Package', roles: ['admin', 'ceo'] },
  { title: 'Price list', path: '/price-list', icon: 'DollarSign', roles: ['admin', 'ceo'] },
  { title: 'Stock', path: '/stock', icon: 'Warehouse', roles: ['admin', 'ceo'] },
  { title: 'Stock by Date', path: '/stock-by-date', icon: 'Warehouse', roles: ['admin', 'ceo'] },
  { title: 'Stock control', path: '/stock-control', icon: 'ClipboardList', roles: ['admin', 'ceo'] },
  { title: 'Documents', path: '/documents', icon: 'FileText', roles: ['admin', 'ceo'] },
  { title: 'Goods Received', path: '/goods-received', icon: 'PackagePlus', roles: ['admin', 'ceo'] },
  { title: 'Reports', path: '/reports', icon: 'BarChart3', roles: ['admin', 'ceo'] },
  { title: 'My Sales', path: '/my-sales', icon: 'Receipt', roles: ['admin', 'ceo', 'pharmacist', 'cashier'] },
  { title: 'Users & security', path: '/users', icon: 'Users', roles: ['admin', 'ceo'] },
  { title: 'Payment types', path: '/payment-types', icon: 'CreditCard', roles: ['admin'] },
  { title: 'Expense types', path: '/expense-types', icon: 'Tags', roles: ['admin', 'ceo'] },
  { title: 'Drug availability', path: '/availability', icon: 'Search', roles: ['admin', 'ceo', 'pharmacist', 'cashier'] },
  { title: 'Outlets', path: '/outlets', icon: 'Store', roles: ['admin'] },
  { title: 'Requisitions', path: '/requisitions', icon: 'ClipboardList', roles: ['admin', 'ceo', 'pharmacist', 'cashier'] },
  { title: 'Settings', path: '/settings', icon: 'Settings', roles: ['admin'] },
];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'System Admin',
  ceo: 'CEO',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
};

export const DEFAULT_ROUTE: Record<AppRole, string> = {
  admin: '/dashboard',
  ceo: '/ceo',
  pharmacist: '/pos',
  cashier: '/pos',
};

export function canAccess(role: AppRole, path: string): boolean {
  const item = NAV_ITEMS.find(n => n.path === path);
  if (!item) return false;
  return item.roles.includes(role);
}
