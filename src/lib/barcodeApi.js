import { db } from '../db/localDb';
import { supabase } from '../supabaseClient';

/**
 * Barcode se product dhundho — pehle Dexie (offline), phir Supabase fallback
 * Match: product ka sku ya barcode field
 */
export async function findProductByBarcode(barcode) {
  if (!barcode) return { product: null, source: 'local' };

  // Step 1: Dexie — instant, offline-first
  // Look up by barcode index (which is indexed)
  let localResult = await db.products
    .where('barcode').equals(barcode)
    .filter(p => p.is_active !== false)
    .first();

  // If not found, look up by sku using filter
  if (!localResult) {
    localResult = await db.products
      .filter(p => p.sku === barcode && p.is_active !== false)
      .first();
  }

  if (localResult) {
    // Attach product_units from Dexie local store
    localResult.product_units = await db.productUnits
      .where('product_id').equals(localResult.id)
      .toArray();

    return { product: localResult, source: 'local' };
  }

  // Step 2: Supabase fallback — sirf online ho toh
  if (!navigator.onLine) return { product: null, source: 'offline' };

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_units(*)')
      .or(`sku.eq."${barcode}",barcode.eq."${barcode}"`)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return { product: null, source: 'remote' };

    // Future offline use ke liye Dexie mein bhi save karo
    const { product_units, ...info } = data;
    await db.products.put(info);
    if (product_units?.length) {
      await db.productUnits.bulkPut(product_units);
    }

    return { product: data, source: 'remote' };
  } catch (err) {
    console.error('[findProductByBarcode] Supabase lookup error:', err.message);
    return { product: null, source: 'remote' };
  }
}
