import { useState, useEffect } from 'react';
import { db } from '../../db/localDb';

/**
 * CategorySidebar
 * Props:
 *   selectedCategory: string ('All' | 'Grocery' | 'Medical' | ...)
 *   onCategorySelect: (categoryName: string) => void
 *   collapsed: boolean
 *   onToggleCollapse: () => void
 *   productCountByCategory: { [categoryName]: number }
 */
export const CategorySidebar = ({
  selectedCategory,
  onCategorySelect,
  collapsed,
  onToggleCollapse,
  productCountByCategory = {}
}) => {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const list = await db.categories.orderBy('sort_order').toArray();
        setCategories(list);
      } catch (err) {
        console.warn('[CategorySidebar] Failed to load categories from IndexedDB:', err.message);
      }
    }
    loadCategories();
  }, []);

  return (
    <aside className="category-sidebar">
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {categories.map((cat) => {
          const selected = selectedCategory === cat.name;
          const count = productCountByCategory[cat.name] ?? 0;
          return (
            <button
              key={cat.id || cat.name}
              className={`category-item ${selected ? 'active' : ''}`}
              onClick={() => onCategorySelect(cat.name)}
              style={{ '--cat-color': cat.color }}
              data-tooltip={cat.name}
            >
              <span className="cat-icon">{cat.icon}</span>
              {!collapsed && (
                <>
                  <span className="cat-label">{cat.name}</span>
                  <span className="cat-count">{count}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="sidebar-collapse-btn"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '▶' : '◀'}
      </button>
    </aside>
  );
};
