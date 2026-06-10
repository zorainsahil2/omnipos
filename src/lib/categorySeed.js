import { db } from '../db/localDb';
import { supabase } from '../supabaseClient';

export const DEFAULT_CATEGORIES = [
  { name: 'All',     icon: '🛒', color: '#6366f1', sort_order: 0 },
  { name: 'Grocery', icon: '🥬', color: '#16a34a', sort_order: 1 },
  { name: 'Medical', icon: '💊', color: '#dc2626', sort_order: 2 },
  { name: 'Bakery',  icon: '🍞', color: '#d97706', sort_order: 3 },
  { name: 'Dairy',   icon: '🥛', color: '#0284c7', sort_order: 4 },
  { name: 'Drinks',  icon: '🧃', color: '#7c3aed', sort_order: 5 },
  { name: 'Other',   icon: '📦', color: '#6b7280', sort_order: 6 },
  { name: 'Favourites', icon: '⭐', color: '#f59e0b', sort_order: 7 },
];

export async function seedDefaultCategories(tenantId) {
  try {
    const existing = await db.categories
      .where('tenant_id').equals(tenantId).count();
    if (existing > 0) return; // Already seeded locally
    
    const categoriesToSeed = DEFAULT_CATEGORIES.map(c => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      sort_order: c.sort_order,
    }));

    // Seed locally in IndexedDB
    await db.categories.bulkAdd(categoriesToSeed);

    // Sync to Supabase in the background
    const { error } = await supabase
      .from('categories')
      .insert(categoriesToSeed);

    if (error) {
      console.warn('[seedDefaultCategories] Supabase sync returned error:', error.message);
    }
  } catch (err) {
    console.warn('[seedDefaultCategories] Failed to seed default categories:', err.message);
  }
}
