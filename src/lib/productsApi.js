import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Sum all inventory batch quantities for a product. */
const totalStock = (batches = []) =>
  batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);

/** Base-unit price for a product (from product_units). */
const basePrice = (units = []) =>
  units.find(u => u.is_base_unit)?.price ?? 0;

/**
 * Classify stock status from quantity and reorder_level.
 * Returns: 'in_stock' | 'low_stock' | 'out_of_stock'
 */
export const stockStatus = (qty, reorderLevel = 10) => {
  if (qty <= 0)              return 'out_of_stock';
  if (qty <= reorderLevel)   return 'low_stock';
  return 'in_stock';
};

// ─── client-side price/stock filter helper ──────────────────────────────────

function applyClientFilters(products, filters) {
  return products.filter(p => {
    const price = basePrice(p.product_units);
    const stock = totalStock(p.inventory_batches);
    const status = stockStatus(stock, p.reorder_level ?? 10);

    if (filters.priceMin !== '' && filters.priceMin !== undefined) {
      if (price < Number(filters.priceMin)) return false;
    }
    if (filters.priceMax !== '' && filters.priceMax !== undefined) {
      if (price > Number(filters.priceMax)) return false;
    }
    if (filters.stockStatus && filters.stockStatus !== 'all') {
      if (status !== filters.stockStatus) return false;
    }
    return true;
  });
}

// ─── sort helper ─────────────────────────────────────────────────────────────

export function sortProducts(products, sortBy) {
  const arr = [...products];
  switch (sortBy) {
    case 'name_asc':    return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'name_desc':   return arr.sort((a, b) => b.name.localeCompare(a.name));
    case 'price_asc':   return arr.sort((a, b) => basePrice(a.product_units) - basePrice(b.product_units));
    case 'price_desc':  return arr.sort((a, b) => basePrice(b.product_units) - basePrice(a.product_units));
    case 'stock_asc':   return arr.sort((a, b) => totalStock(a.inventory_batches) - totalStock(b.inventory_batches));
    case 'stock_desc':  return arr.sort((a, b) => totalStock(b.inventory_batches) - totalStock(a.inventory_batches));
    default:            return arr;
  }
}

// ─── ONLINE: Supabase filtered fetch ─────────────────────────────────────────

/**
 * Fetch active products with server-side text/type/brand filters,
 * plus client-side price-range and stock-status filters.
 *
 * filters shape:
 *   search:      string  — partial match on name | barcode | sku
 *   type:        string  — 'all' | 'grocery' | 'medical'
 *   brand:       string  — 'all' | exact brand string
 *   priceMin:    number | ''
 *   priceMax:    number | ''
 *   stockStatus: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
 */
export async function fetchFilteredProducts(filters = {}) {
  let query = supabase
    .from('products')
    .select(`
      *,
      product_units(*),
      inventory_batches(quantity)
    `)
    .eq('is_active', true);

  // Text search — name OR barcode OR sku (case-insensitive)
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`name.ilike.${term},barcode.ilike.${term},sku.ilike.${term}`);
  }

  // Store type (grocery / medical)
  if (filters.type && filters.type !== 'all') {
    query = query.eq('type', filters.type);
  }

  // Brand
  if (filters.brand && filters.brand !== 'all') {
    query = query.eq('brand', filters.brand);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Client-side: price range + stock status
  return applyClientFilters(data || [], filters);
}

// ─── ONLINE: fetch unique filter options (brands list) ───────────────────────

export async function fetchFilterOptions() {
  const { data, error } = await supabase
    .from('products')
    .select('type, brand')
    .eq('is_active', true);

  if (error) throw error;

  const brands = [...new Set((data || []).map(p => p.brand).filter(Boolean))].sort();
  return { brands };
}

// ─── OFFLINE: Dexie.js fallback ──────────────────────────────────────────────

export async function fetchFilteredProductsOffline(filters = {}) {
  // 1. load products from Dexie
  let products = await localDb.products
    .filter(p => p.is_active !== false)
    .toArray();

  // 2. Attach units
  for (const p of products) {
    p.product_units = await localDb.productUnits
      .where('product_id').equals(p.id).toArray();
    p.inventory_batches = await localDb.inventoryBatches
      .where('product_id').equals(p.id).toArray();
  }

  // 3. Text search
  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    products = products.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.barcode?.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term)
    );
  }

  // 4. Type
  if (filters.type && filters.type !== 'all') {
    products = products.filter(p => p.type === filters.type);
  }

  // 5. Brand
  if (filters.brand && filters.brand !== 'all') {
    products = products.filter(p => p.brand === filters.brand);
  }

  // 6. Price + stock client-side
  return applyClientFilters(products, filters);
}

// ─── Existing API functions (unchanged) ──────────────────────────────────────

export async function updateProduct(productId, updatedFields) {
  const { data, error } = await supabase
    .from('products')
    .update(updatedFields)
    .eq('id', productId)
    .select()
    .single();
  if (error) throw error;
  await localDb.products.update(productId, updatedFields);
  return data;
}

export async function softDeleteProduct(productId) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', productId);
  if (error) throw error;
  await localDb.products.delete(productId);
}

// ─── BULK IMPORT ─────────────────────────────────────────────────────────────

/**
 * Fetch all existing active SKUs for the current tenant.
 * Used for duplicate detection before import.
 */
export async function fetchExistingSkus() {
  const { data, error } = await supabase
    .from('products')
    .select('sku')
    .eq('is_active', true);
  if (error) throw error;
  return new Set((data || []).map(p => p.sku).filter(Boolean));
}

/**
 * Batch insert validated rows into:
 *   1. products table
 *   2. product_units table (base unit + price)
 *   3. inventory_batches table (initial stock, if > 0)
 *
 * Processes in chunks of 50 to stay within Supabase limits.
 * Calls onProgress({ inserted, total, failed }) after each chunk.
 *
 * @param {Array}    validRows    - validated row objects from csvValidator
 * @param {string}   tenantId
 * @param {Function} onProgress  - optional progress callback
 * @returns {{ inserted: number, failed: Array }}
 */
export async function batchInsertProducts(validRows, tenantId, onProgress = null) {
  const CHUNK_SIZE = 50;
  const results    = { inserted: 0, failed: [] };
  const today      = new Date().toISOString().split('T')[0];

  for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
    const chunk = validRows.slice(i, i + CHUNK_SIZE);

    // ── Build product records ──
    const productRecords = chunk.map(r => ({
      id:                   crypto.randomUUID(),
      tenant_id:            tenantId,
      name:                 r.data.name.trim(),
      sku:                  r.data.sku?.trim() || null,
      barcode:              r.data.barcode?.trim() || null,
      brand:                r.data.brand?.trim() || null,
      type:                 r.normType || 'grocery',
      generic_name:         r.data.generic_name?.trim() || null,
      manufacturer:         r.data.manufacturer?.trim() || null,
      prescription_required: String(r.data.prescription_required).toLowerCase() === 'true',
      reorder_level:        parseFloat(r.data.reorder_level) || 10,
      is_active:            true,
    }));

    // ── Insert products ──
    const { data: inserted, error: prodErr } = await supabase
      .from('products')
      .insert(productRecords)
      .select('id');

    if (prodErr) {
      results.failed.push(
        ...chunk.map((r, idx) => ({
          rowNumber: r.rowNumber,
          sku:       r.data.sku,
          reason:    prodErr.message,
        }))
      );
      onProgress?.({ inserted: results.inserted, total: validRows.length, failed: results.failed.length });
      continue;
    }

    results.inserted += inserted.length;

    // ── Build product_units records ──
    const unitRecords = productRecords.map((prod, idx) => ({
      id:                crypto.randomUUID(),
      product_id:        prod.id,
      unit_name:         chunk[idx].data.base_unit?.trim() || 'Piece',
      is_base_unit:      true,
      conversion_factor: 1.0,
      price:             parseFloat(chunk[idx].data.selling_price) || 0,
    }));

    await supabase.from('product_units').insert(unitRecords);

    // ── Build initial inventory_batches (only if stock > 0) ──
    const batchRecords = productRecords
      .map((prod, idx) => {
        const qty = parseFloat(chunk[idx].data.current_stock);
        if (!qty || qty <= 0) return null;
        return {
          id:            crypto.randomUUID(),
          tenant_id:     tenantId,
          product_id:    prod.id,
          batch_number:  `IMPORT-${today}`,
          purchase_cost: parseFloat(chunk[idx].data.purchase_price) || 0,
          quantity:      qty,
        };
      })
      .filter(Boolean);

    if (batchRecords.length > 0) {
      await supabase.from('inventory_batches').insert(batchRecords);
    }

    onProgress?.({ inserted: results.inserted, total: validRows.length, failed: results.failed.length });
  }

  return results;
}

/**
 * Re-fetch all active products for the tenant and sync to Dexie IndexedDB.
 * Called after bulk import to keep offline cache fresh.
 */
export async function syncImportedProductsToLocal(tenantId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_units(*)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    if (error) return;

    await localDb.products.clear();
    await localDb.productUnits.clear();

    for (const prod of (data || [])) {
      const { product_units, ...info } = prod;
      await localDb.products.put(info);
      if (product_units?.length) await localDb.productUnits.bulkPut(product_units);
    }
  } catch (err) {
    console.warn('[syncImportedProductsToLocal] Failed:', err.message);
  }
}
