import Dexie from 'dexie';

// Initialize Dexie local IndexedDB
export const localDb = new Dexie('OmniPOS_LocalDB');

// Define database tables and index keys
localDb.version(1).stores({
  products: 'id, tenant_id, name, barcode, type, generic_name, manufacturer, prescription_required',
  productUnits: 'id, product_id, unit_name, is_base_unit, conversion_factor, price',
  inventoryBatches: 'id, tenant_id, product_id, batch_number, expiry_date, purchase_cost, quantity',
  salesQueue: '++localId, tenant_id, cashier_id, total_amount, discount, tax_amount, payment_method, created_at, synced'
});

// Helper functions to manage local data
export const clearLocalCache = async () => {
  await Promise.all([
    localDb.products.clear(),
    localDb.productUnits.clear(),
    localDb.inventoryBatches.clear()
  ]);
};

export const getSalesQueueCount = async () => {
  return await localDb.salesQueue.where('synced').equals(0).count();
};
