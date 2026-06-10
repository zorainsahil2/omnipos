import { useState, useEffect, useCallback } from 'react';
import { db } from '../db/localDb';

export function useBillingProducts(selectedCategory, searchQuery, trigger = null) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(false);

  const loadProducts = useCallback(async () => {
    const _t = trigger;
    setLoading(true);
    try {
      let results;

      if (selectedCategory === 'Favourites') {
        // Special category: starred products
        results = await db.products
          .filter(p => (p.is_favourite === true || p.is_favourite === 1) && p.is_active !== false)
          .toArray();
      } else if (selectedCategory !== 'All') {
        // Filter by category
        results = await db.products
          .where('category')
          .equals(selectedCategory)
          .filter(p => p.is_active !== false)
          .toArray();
      } else {
        // All active products
        results = await db.products
          .filter(p => p.is_active !== false)
          .toArray();
      }

      // Search query client-side filtering on names, SKU, barcode, generic formulas
      if (searchQuery?.trim()) {
        const q = searchQuery.toLowerCase().trim();
        results = results.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.generic_name && p.generic_name.toLowerCase().includes(q))
        );
      }

      // Sort: Favourites first, then alphabetical by name
      results.sort((a, b) => {
        const aFav = a.is_favourite === true || a.is_favourite === 1;
        const bFav = b.is_favourite === true || b.is_favourite === 1;
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      setProducts(results);
    } catch (err) {
      console.error('[useBillingProducts] Error loading products:', err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery, trigger]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return { products, loading, refetch: loadProducts };
}
