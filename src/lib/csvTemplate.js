/**
 * Generates and downloads the OmniPOS product import CSV template.
 * Headers are adapted to the actual OmniPOS schema (products + product_units + inventory_batches).
 */
export function downloadCsvTemplate() {
  const headers = [
    'name',                 // required — product name
    'sku',                  // required — unique identifier
    'type',                 // required — grocery | medical
    'brand',                // optional
    'barcode',              // optional — barcode / QR
    'base_unit',            // required — e.g. Kg, Tablet, Strip, Piece, Liter
    'selling_price',        // required — base unit selling price (number)
    'purchase_price',       // optional — cost price for initial stock batch
    'current_stock',        // optional — initial stock quantity
    'reorder_level',        // optional — low-stock threshold (default 10)
    'generic_name',         // optional — medical only (e.g. Paracetamol)
    'manufacturer',         // optional — medical only (e.g. GSK)
    'prescription_required',// optional — medical only (true | false)
  ];

  const examples = [
    ['Sugar Premium',   'SKU-001', 'grocery', 'Dawn',   '',        'Kg',     '120', '95',  '50',  '10', '',            '',         'false'],
    ['Basmati Rice',    'SKU-002', 'grocery', 'Guard',  '',        'Kg',     '280', '230', '30',  '5',  '',            '',         'false'],
    ['Cooking Oil 5L',  'SKU-003', 'grocery', 'Dalda',  '',        'Liter',  '650', '520', '40',  '8',  '',            '',         'false'],
    ['Panadol 500mg',   'SKU-004', 'medical', 'GSK',    '',        'Strip',  '15',  '11',  '100', '20', 'Paracetamol', 'GSK',      'false'],
    ['Brufen 400mg',    'SKU-005', 'medical', 'Abbott', '',        'Tablet', '8',   '6',   '200', '30', 'Ibuprofen',   'Abbott',   'false'],
    ['Augmentin 375mg', 'SKU-006', 'medical', 'GSK',    '',        'Tablet', '35',  '28',  '150', '25', 'Amoxicillin', 'GSK',      'true'],
  ];

  const rows = [
    headers.join(','),
    ...examples.map(r => r.join(',')),
  ];

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'omnipos_products_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
