import { useState, useEffect } from 'react';
import { db } from '../db/localDb';

/**
 * Custom hook to calculate the active product count in each category.
 * @param {any} trigger - any state variable that should trigger re-computation when changed (e.g. key updates)
 */
export function useProductCountByCategory(trigger = null) {
  const [counts, setCounts] = useState({ All: 0, Favourites: 0 });

  useEffect(() => {
    async function computeCounts() {
      try {
        const allProducts = await db.products
          .filter(p => p.is_active !== false)
          .toArray();

        const newCounts = { All: allProducts.length, Favourites: 0 };

        allProducts.forEach(p => {
          if (p.category) {
            newCounts[p.category] = (newCounts[p.category] || 0) + 1;
          }
          if (p.is_favourite === true || p.is_favourite === 1) {
            newCounts['Favourites'] = (newCounts['Favourites'] || 0) + 1;
          }
        });

        setCounts(newCounts);
      } catch (err) {
        console.warn('[useProductCountByCategory] Error calculating counts:', err.message);
      }
    }

    computeCounts();
  }, [trigger]);

  return counts;
}
