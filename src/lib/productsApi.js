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
