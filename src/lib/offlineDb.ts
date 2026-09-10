import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppRole } from '@/lib/roles';

export type QueueKind = 'sale' | 'requisition' | 'document';
export type QueueStatus = 'pending' | 'syncing' | 'failed';

export interface OfflineQueueItem {
  id: string;
  kind: QueueKind;
  userId: string;
  outletId: string;
  deviceKey: string;
  createdAt: string;
  payload: Record<string, unknown>;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
}

export interface OfflineProduct {
  id: string;
  name: string;
  category: string;
  indication: string | null;
  qty: number;
  reorder_level: number;
  uom: string;
  cost_price: number;
  sales_price: number;
  wholesale_price: number;
  expiry_date: string | null;
  supplier_name: string | null;
  batch_number: string | null;
  created_at: string;
  status: string;
  cached_at: string;
}

export interface OfflineAuthorization {
  id: string;
  username: string;
  user: Record<string, unknown>;
  fullName: string;
  role: AppRole;
  outletId: string | null;
  deviceKey: string;
  authorizedAt: string;
  expiresAt: string;
  passwordSalt: string;
  passwordVerifier: string;
}

interface LocalMeta { key: string; value: unknown }

interface PatriversOfflineSchema extends DBSchema {
  queue: { key: string; value: OfflineQueueItem; indexes: { 'by-status': QueueStatus; 'by-user': string } };
  products: { key: string; value: OfflineProduct };
  auth: { key: string; value: OfflineAuthorization };
  meta: { key: string; value: LocalMeta };
}

let database: Promise<IDBPDatabase<PatriversOfflineSchema>> | null = null;

export function getOfflineDb() {
  if (!database) {
    database = openDB<PatriversOfflineSchema>('patrivers-offline', 1, {
      upgrade(db) {
        const queue = db.createObjectStore('queue', { keyPath: 'id' });
        queue.createIndex('by-status', 'status');
        queue.createIndex('by-user', 'userId');
        db.createObjectStore('products', { keyPath: 'id' });
        db.createObjectStore('auth', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return database;
}

export async function enqueueOffline(item: Omit<OfflineQueueItem, 'status' | 'attempts'>) {
  const db = await getOfflineDb();
  await db.put('queue', { ...item, status: 'pending', attempts: 0 });
}

export async function getQueueItems() {
  return (await getOfflineDb()).getAll('queue');
}

export async function updateQueueItem(item: OfflineQueueItem) {
  await (await getOfflineDb()).put('queue', item);
}

export async function removeQueueItem(id: string) {
  await (await getOfflineDb()).delete('queue', id);
}

export async function cacheProducts(products: OfflineProduct[]) {
  const db = await getOfflineDb();
  const tx = db.transaction('products', 'readwrite');
  await tx.store.clear();
  await Promise.all(products.map(product => tx.store.put(product)));
  await tx.done;
}

export async function getCachedProducts() {
  return (await getOfflineDb()).getAll('products');
}

export async function reduceCachedStock(items: Array<{ product_id: string; quantity: number }>) {
  const db = await getOfflineDb();
  const tx = db.transaction('products', 'readwrite');
  for (const item of items) {
    const product = await tx.store.get(item.product_id);
    if (product) await tx.store.put({ ...product, qty: product.qty - item.quantity });
  }
  await tx.done;
}

export async function increaseCachedStock(items: Array<{ product_id: string; quantity: number; batch_number?: string; expiry_date?: string }>) {
  const db = await getOfflineDb();
  const tx = db.transaction('products', 'readwrite');
  for (const item of items) {
    const product = await tx.store.get(item.product_id);
    if (product) {
      await tx.store.put({
        ...product,
        qty: product.qty + item.quantity,
        batch_number: item.batch_number || product.batch_number,
        expiry_date: item.expiry_date || product.expiry_date,
      });
    }
  }
  await tx.done;
}

export async function saveOfflineAuthorization(auth: OfflineAuthorization) {
  await (await getOfflineDb()).put('auth', auth);
  localStorage.setItem('patrivers_last_user', auth.id);
}

export async function getOfflineAuthorization(id?: string | null) {
  const key = id || localStorage.getItem('patrivers_last_user');
  return key ? (await getOfflineDb()).get('auth', key) : undefined;
}

export async function getOfflineAuthorizationByUsername(username: string) {
  const authorizations = await (await getOfflineDb()).getAll('auth');
  return authorizations.find(item => item.username.toLowerCase() === username.toLowerCase());
}

export async function clearCurrentOfflineUser() {
  localStorage.removeItem('patrivers_last_user');
}

/** Remove one account's offline authorization (used when an account is suspended or revoked). */
export async function removeOfflineAuthorization(id: string) {
  const db = await getOfflineDb();
  await db.delete('auth', id);
  if (localStorage.getItem('patrivers_last_user') === id) localStorage.removeItem('patrivers_last_user');
}

/**
 * Sign-out hygiene on a shared till: keep only the signing-out user's seven-day
 * authorization (needed for offline sign-in) and any queued transactions that still
 * have to sync; drop every other account's cached authorization and session metadata.
 * The product catalogue cache is branch stock, not personal data, and stays so that
 * offline sales still work after an ordinary sign-out.
 */
export async function clearOfflineDataOnSignOut(keepUserId?: string | null) {
  const db = await getOfflineDb();
  const authorizations = await db.getAll('auth');
  for (const auth of authorizations) {
    if (auth.id !== keepUserId) await db.delete('auth', auth.id);
  }
  await db.clear('meta');
  localStorage.removeItem('patrivers_last_user');
}

export async function setOfflineMeta(key: string, value: unknown) {
  await (await getOfflineDb()).put('meta', { key, value });
}

export async function getOfflineMeta<T>(key: string): Promise<T | undefined> {
  const row = await (await getOfflineDb()).get('meta', key);
  return row?.value as T | undefined;
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

async function derivePasswordVerifier(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const stableSalt = new Uint8Array(salt).buffer;
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: stableSalt, iterations: 210000, hash: 'SHA-256' }, material, 256);
  return bytesToBase64(new Uint8Array(bits));
}

export async function createPasswordVerifier(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToBase64(salt), verifier: await derivePasswordVerifier(password, salt) };
}

export async function verifyOfflinePassword(password: string, saltBase64: string, expected: string) {
  const salt = Uint8Array.from(atob(saltBase64), char => char.charCodeAt(0));
  return (await derivePasswordVerifier(password, salt)) === expected;
}

export function getDeviceKey(userId?: string) {
  const existing = localStorage.getItem('patrivers_device_key');
  const baseKey = existing || crypto.randomUUID();
  if (!existing) localStorage.setItem('patrivers_device_key', baseKey);
  return userId ? `${baseKey}:${userId}` : baseKey;
}