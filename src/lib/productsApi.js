import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';

/**
 * Fetch all active products for the current tenant (with units).
 */
export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_units(*)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Update a product's editable fields.
 * Also updates the local IndexedDB cache.
 */
export async function updateProduct(productId, updatedFields) {
  const { data, error } = await supabase
    .from('products')
    .update(updatedFields)
    .eq('id', productId)
    .select()
    .single();
  if (error) throw error;

  // Sync to local Dexie
  await localDb.products.update(productId, updatedFields);

  return data;
}

/**
 * Soft-delete a product by setting is_active = false.
 * Does NOT remove the row — preserves sales history integrity.
 */
export async function softDeleteProduct(productId) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', productId);
  if (error) throw error;

  // Remove from local Dexie so offline list is also clean
  await localDb.products.delete(productId);
}
