export function ScanFeedback({ feedback, formatCurrency }) {
  if (!feedback) return null;

  const styles = {
    success:  { bg: '#f0fdf4', border: '#16a34a', color: '#15803d' },
    error:    { bg: '#fff1f2', border: '#dc2626', color: '#b91c1c' },
    warning:  { bg: '#fffbeb', border: '#d97706', color: '#92400e' },
    scanning: { bg: '#f8fafc', border: '#94a3b8', color: '#475569' },
  };
  const s = styles[feedback.type] || styles.scanning;

  const baseUnit = feedback.product?.product_units?.find(u => u.is_base_unit);
  const priceVal = baseUnit?.price;

  return (
    <div
      className="scan-feedback"
      style={{ background: s.bg, border: `1.5px solid ${s.border}`, color: s.color }}
      role="status"
      aria-live="polite"
    >
      <span className="scan-msg">{feedback.message}</span>
      {feedback.product && priceVal !== undefined && (
        <span className="scan-price">
          {formatCurrency ? formatCurrency(priceVal) : `Rs ${priceVal}`}
        </span>
      )}
    </div>
  );
}
