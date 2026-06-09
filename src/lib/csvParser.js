import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE_MB = 5;

/** Validate file type and size. Returns error string or null. */
export function validateFile(file) {
  if (!file) return 'No file selected.';
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) return `File too large (${sizeMB.toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE_MB} MB.`;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) return 'Unsupported file type. Please upload a .csv or .xlsx file.';
  return null;
}

/** Parse a .csv file → array of row objects (PapaParse). */
export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header:         true,
      skipEmptyLines: true,
      transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_'),
      transform:      val => val.trim(),
      complete: results => resolve(results.data),
      error:    err     => reject(new Error(err.message || 'CSV parsing failed')),
    });
  });
}

/** Parse a .xlsx/.xls file → array of row objects (SheetJS). */
export function parseXlsxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb    = XLSX.read(e.target.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // sheet_to_json with defval='' prevents undefined values
        const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        // Normalize header keys same as PapaParse config
        const normalized = rows.map(row => {
          const out = {};
          for (const [k, v] of Object.entries(row)) {
            out[k.trim().toLowerCase().replace(/\s+/g, '_')] = String(v).trim();
          }
          return out;
        });
        resolve(normalized);
      } catch (err) {
        reject(new Error('Excel parsing failed: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsBinaryString(file);
  });
}

/** Detect file type and parse accordingly. */
export async function parseFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseCsvFile(file);
  if (['xlsx', 'xls'].includes(ext)) return parseXlsxFile(file);
  throw new Error('Unsupported file type.');
}
