import { useEffect, useRef, useCallback } from 'react';

/**
 * Barcode scanner detection strategy:
 * - Characters jo 50ms se kam mein aate hain = scanner input
 * - Characters jo 50ms se zyada gap ke saath aate hain = human typing
 * - Enter key aane pe = scan complete, callback trigger
 *
 * @param {function} onScan    - (barcode: string) => void
 * @param {object}   options
 * @param {boolean}  options.enabled    - scanner listen kare ya nahi (default true)
 * @param {number}   options.minLength  - minimum barcode length (default 3)
 * @param {number}   options.timeGap    - max ms between chars (default 50)
 */
export function useBarcodeScanner(onScan, options = {}) {
  const { enabled = true, minLength = 3, timeGap = 50 } = options;

  const bufferRef      = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timerRef       = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    // Active input/textarea mein type ho raha hai — scanner ignore karo
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const now = Date.now();
    const gap = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    // Enter key = scan complete
    if (e.key === 'Enter') {
      const barcode = bufferRef.current.trim();
      bufferRef.current = '';
      if (timerRef.current) clearTimeout(timerRef.current);
      if (barcode.length >= minLength) onScan(barcode);
      return;
    }

    // Printable characters only
    if (e.key.length !== 1) return;

    // Gap check — zyada time lag raha hai toh buffer reset
    if (gap > timeGap && bufferRef.current.length > 0) {
      bufferRef.current = '';
    }

    bufferRef.current += e.key;

    // Auto-reset — agar Enter nahi aaya 200ms mein toh buffer clear
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { bufferRef.current = ''; }, 200);
  }, [enabled, minLength, timeGap, onScan]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleKeyDown]);
}
