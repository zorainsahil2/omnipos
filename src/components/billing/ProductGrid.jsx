import { ProductCard } from './ProductCard';

/**
 * ProductGrid
 * Props:
 *   products: Array
 *   stockMap: Object (map of product_id -> total quantity)
 *   onAddToCart: (product: object) => void
 *   onToggleFavourite: (productId: string, isFav: boolean) => void
 *   formatCurrency: (amount: number) => string
 *   loading: boolean
 */
export const ProductGrid = ({
  products = [],
  stockMap = {},
  onAddToCart,
  onToggleFavourite,
  formatCurrency,
  loading = false
}) => {
  if (loading) {
    return (
      <div style={{ color: '#64748b', padding: '40px 0', textAlign: 'center', gridColumn: '1/-1' }}>
        <p>Loading catalog items...</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div style={{ color: '#64748b', padding: '40px 0', textAlign: 'center', gridColumn: '1/-1' }}>
        <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>🔍 No products found</p>
        <p style={{ fontSize: '0.85rem' }}>No products match your selected category or search filters.</p>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((prod) => {
        const stock = stockMap[prod.id] || 0;
        return (
          <ProductCard
            key={prod.id}
            product={prod}
            stock={stock}
            onAddToCart={onAddToCart}
            onToggleFavourite={onToggleFavourite}
            formatCurrency={formatCurrency}
          />
        );
      })}
    </div>
  );
};
