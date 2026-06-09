/**
 * OmniPOS CSV Row Validator
 * Validates parsed CSV rows against the products schema.
 *
 * Schema: products (name, sku, type, brand, barcode, reorder_level, generic_name,
 *                   manufacturer, prescription_required)
 *       + product_units (base_unit, selling_price)
 *       + inventory_batches (current_stock, purchase_price)
 */

const VALID_TYPES = new Set(['grocery', 'medical']);

const VALID_UNITS = new Set([
  'kg', 'g', 'gram', 'liter', 'ml', 'litre',
  'piece', 'pcs', 'strip', 'tablet', 'tab', 'capsule', 'cap',
  'packet', 'pack', 'box', 'bottle', 'bag', 'can', 'sachet',
  'dozen', 'pair', 'roll', 'sheet',
]);

const normalizeType = (val = '') => {
  const v = val.trim().toLowerCase();
  if (['medical', 'medicine', 'pharmacy', 'pharma'].includes(v)) return 'medical';
  if (['grocery', 'food', 'general'].includes(v)) return 'grocery';
  return v; // let validator catch invalid values
};

const normalizeUnit = (val = '') => val.trim().toLowerCase().replace(/\s+/g, '');

/**
 * Validate a single parsed row.
 * @param {object} row           - raw parsed row object
 * @param {number} rowIndex      - 0-based index in parsed array
 * @param {Set}    existingSkus  - set of SKUs already in Supabase
 * @param {Set}    seenInFile    - set of SKUs already seen in this file
 * @returns {object} validation result
 */
export function validateRow(row, rowIndex, existingSkus, seenInFile) {
  const errors = [];

  // ── Required fields ──
  if (!row.name?.trim())
    errors.push('Name is required');

  if (!row.sku?.trim())
    errors.push('SKU is required');

  if (!row.base_unit?.trim())
    errors.push('Base unit is required');

  // ── Type / category ──
  const normType = normalizeType(row.type || row.category || '');
  if (!row.type?.trim() && !row.category?.trim()) {
    errors.push('Type is required (grocery | medical)');
  } else if (!VALID_TYPES.has(normType)) {
    errors.push(`Type must be "grocery" or "medical" (got: "${row.type || row.category}")`);
  }

  // ── Unit validation ──
  const normUnit = normalizeUnit(row.base_unit || '');
  if (row.base_unit?.trim() && !VALID_UNITS.has(normUnit)) {
    // Warn but don't error — shopkeeper may have custom units
    errors.push(`Unit "${row.base_unit}" is unusual. Common units: Kg, Tablet, Strip, Piece, Liter`);
  }

  // ── Numeric fields ──
  const sellingPrice  = parseFloat(row.selling_price);
  const purchasePrice = parseFloat(row.purchase_price);
  const stock         = parseFloat(row.current_stock);
  const reorder       = parseFloat(row.reorder_level);

  if (row.selling_price !== undefined && row.selling_price !== '') {
    if (isNaN(sellingPrice) || sellingPrice < 0)
      errors.push('Selling price must be a positive number');
  } else {
    errors.push('Selling price is required');
  }

  if (row.purchase_price !== undefined && row.purchase_price !== '') {
    if (isNaN(purchasePrice) || purchasePrice < 0)
      errors.push('Purchase price must be a positive number');
    else if (!isNaN(sellingPrice) && purchasePrice > sellingPrice)
      errors.push('⚠ Purchase price exceeds selling price (margin warning)');
  }

  if (row.current_stock !== undefined && row.current_stock !== '') {
    if (isNaN(stock) || stock < 0)
      errors.push('Stock must be a positive number');
  }

  if (row.reorder_level !== undefined && row.reorder_level !== '') {
    if (isNaN(reorder) || reorder < 0)
      errors.push('Reorder level must be a positive number');
  }

  // ── Duplicate detection ──
  const sku = row.sku?.trim();
  const isDuplicateInDb   = sku ? existingSkus.has(sku)  : false;
  const isDuplicateInFile = sku ? seenInFile.has(sku)    : false;
  const isDuplicate       = isDuplicateInDb || isDuplicateInFile;
  const duplicateType     = isDuplicateInDb ? 'db' : isDuplicateInFile ? 'file' : null;

  return {
    rowIndex,
    rowNumber: rowIndex + 2, // +2: 1 for header, 1 for 1-based numbering
    data: row,
    normType,
    normUnit,
    errors,
    isDuplicate,
    duplicateType,
    // isValid = no hard errors AND not a within-file duplicate
    // DB duplicates are "overwritable" — handled by user choice
    isValid: errors.length === 0 && !isDuplicateInFile,
  };
}

/**
 * Validate all rows from the parsed CSV.
 * Tracks seen SKUs within file to detect within-file duplicates.
 */
export function validateAllRows(parsedRows, existingSkus) {
  const seenInFile = new Set();
  return parsedRows.map((row, i) => {
    const result = validateRow(row, i, existingSkus, seenInFile);
    const sku = row.sku?.trim();
    if (sku) seenInFile.add(sku);
    return result;
  });
}
