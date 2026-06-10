import { useState, useEffect, useRef } from 'react';

/* ─── Lazy Loaded Image Component ──────────────────────── */
const LazyImage = ({ src, alt, fallbackText }) => {
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [error, setError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setError(true);
      return;
    }

    let observer;
    const currentImg = imgRef.current;

    if (currentImg && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setLoadedSrc(src);
              observer.unobserve(currentImg);
            }
          });
        },
        { rootMargin: '50px' }
      );
      observer.observe(currentImg);
    } else {
      setLoadedSrc(src);
    }

    return () => {
      if (observer && currentImg) {
        observer.unobserve(currentImg);
      }
    };
  }, [src]);

  if (error || !loadedSrc) {
    return (
      <div ref={imgRef} className="billing-card-placeholder">
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={loadedSrc}
      alt={alt}
      className="billing-card-img"
      onError={() => setError(true)}
      loading="lazy"
    />
  );
};

/**
 * ProductCard
 * Props:
 *   product: object
 *   stock: number
 *   onAddToCart: (product: object) => void
 *   onToggleFavourite: (productId: string, isFav: boolean) => void
 *   formatCurrency: (amount: number) => string
 */
export const ProductCard = ({
  product,
  stock,
  onAddToCart,
  onToggleFavourite,
  formatCurrency
}) => {
  const baseUnit = product.product_units?.find(u => u.is_base_unit);
  const outOf = stock <= 0;
  const isFav = product.is_favourite === true || product.is_favourite === 1;

  return (
    <div
      className={`billing-product-card ${outOf ? 'out-of-stock' : ''}`}
      onClick={() => !outOf && onAddToCart(product)}
      title={outOf ? 'Out of stock' : `Add ${product.name} to cart`}
    >
      {/* Favourite Button (Top Right Star) */}
      <button
        type="button"
        className={`fav-btn ${isFav ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation(); // Stop cart insertion
          onToggleFavourite(product.id, !isFav);
        }}
        aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
      >
        ⭐
      </button>

      {product.prescription_required && (
        <span className="billing-card-rx-badge">Rx</span>
      )}
      <span className="billing-card-type-badge">{product.type}</span>

      <div className="billing-card-img-container">
        <LazyImage
          src={product.image_url}
          alt={product.name}
          fallbackText="📦"
        />
      </div>

      <div className="billing-card-info">
        <h4 className="billing-card-name">{product.name}</h4>
        <div className="billing-card-details-row">
          <span className="billing-card-price">
            {formatCurrency(baseUnit?.price || 0)}
          </span>
          <span className={`billing-card-stock ${outOf ? 'out' : stock <= (product.reorder_level || 10) ? 'low' : ''}`}>
            {stock.toFixed(stock % 1 === 0 ? 0 : 1)} {baseUnit?.unit_name || 'units'}
          </span>
        </div>
      </div>
    </div>
  );
};
