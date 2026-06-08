import { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * useSyncQueue - automatically flushes offline sales to Supabase when connection is restored.
 * Unsynced sales are stored in localDb.salesQueue with synced=0.
 */
export const useSyncQueue = () => {
  const isOnline = useOnlineStatus();
  const isSyncing = useRef(false);

  const flushQueue = async () => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    try {
      // Fetch all unsynced sales from IndexedDB
      const unsyncedSales = await localDb.salesQueue
        .where('synced')
        .equals(0)
        .toArray();

      if (unsyncedSales.length === 0) {
        isSyncing.current = false;
        return;
      }

      console.log(`[SyncQueue] Flushing ${unsyncedSales.length} offline sale(s) to Supabase...`);

      for (const localSale of unsyncedSales) {
        const { localId, synced, items, ...salePayload } = localSale;

        // 1. Insert sale header
        const { data: insertedSale, error: saleErr } = await supabase
          .from('sales')
          .insert(salePayload)
          .select('id')
          .single();

        if (saleErr) {
          console.error('[SyncQueue] Failed to sync sale:', saleErr.message);
          continue;
        }

        // 2. Insert sale items referencing the inserted sale id
        if (items && items.length > 0) {
          const saleItems = items.map(item => ({
            ...item,
            sale_id: insertedSale.id,
          }));

          const { error: itemsErr } = await supabase
            .from('sale_items')
            .insert(saleItems);

          if (itemsErr) {
            console.error('[SyncQueue] Failed to sync sale items:', itemsErr.message);
            continue;
          }

          // 3. Deduct stock from inventory_batches in Supabase for each item
          for (const item of items) {
            if (item.batch_id) {
              await supabase.rpc('deduct_batch_stock', {
                p_batch_id: item.batch_id,
                p_qty: item.quantity,
              });
            }
          }
        }

        // 4. Mark as synced in IndexedDB
        await localDb.salesQueue.update(localId, { synced: 1 });
        console.log(`[SyncQueue] Sale ${localId} synced successfully.`);
      }
    } catch (err) {
      console.error('[SyncQueue] Sync error:', err.message);
    } finally {
      isSyncing.current = false;
    }
  };

  useEffect(() => {
    if (isOnline) {
      // Slight delay to let Supabase auth settle after reconnect
      const timer = setTimeout(flushQueue, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  return { flushQueue };
};
