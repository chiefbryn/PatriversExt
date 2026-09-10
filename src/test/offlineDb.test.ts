import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheProducts,
  createPasswordVerifier,
  enqueueOffline,
  getCachedProducts,
  getOfflineDb,
  getQueueItems,
  increaseCachedStock,
  reduceCachedStock,
  verifyOfflinePassword,
} from '@/lib/offlineDb';

const product = {
  id: 'product-1',
  name: 'Paracetamol 500mg',
  category: 'Analgesic',
  indication: null,
  qty: 10,
  reorder_level: 2,
  uom: 'Tablet',
  cost_price: 1,
  sales_price: 2,
  wholesale_price: 1.5,
  expiry_date: '2028-01-31',
  supplier_name: null,
  batch_number: 'B-1',
  created_at: '2026-01-01T00:00:00.000Z',
  status: 'active',
  cached_at: '2026-01-01T00:00:00.000Z',
};

describe('offline database', () => {
  beforeEach(async () => {
    const db = await getOfflineDb();
    await db.clear('queue');
    await db.clear('products');
    await db.clear('auth');
    await db.clear('meta');
  });

  it('persists queued transactions until synchronization removes them', async () => {
    await enqueueOffline({
      id: 'sale-1',
      kind: 'sale',
      userId: 'user-1',
      outletId: 'outlet-1',
      deviceKey: 'device-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { p_client_id: 'sale-1' },
    });

    expect(await getQueueItems()).toMatchObject([{ id: 'sale-1', status: 'pending', attempts: 0 }]);
  });

  it('applies local sale and receipt quantities without losing expiry data', async () => {
    await cacheProducts([product]);
    await reduceCachedStock([{ product_id: product.id, quantity: 3 }]);
    await increaseCachedStock([{ product_id: product.id, quantity: 2, batch_number: 'B-2', expiry_date: '2029-02-28' }]);

    expect((await getCachedProducts())[0]).toMatchObject({ qty: 9, batch_number: 'B-2', expiry_date: '2029-02-28' });
  });

  it('verifies a cached password without storing plaintext', async () => {
    const saved = await createPasswordVerifier('correct-password');

    expect(saved.verifier).not.toContain('correct-password');
    expect(await verifyOfflinePassword('correct-password', saved.salt, saved.verifier)).toBe(true);
    expect(await verifyOfflinePassword('wrong-password', saved.salt, saved.verifier)).toBe(false);
  });
});