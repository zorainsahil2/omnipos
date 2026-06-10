import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';

/**
 * File path format: {tenantId}/{productId}_{timestamp}.webp
 * WebP format use karo — smaller size, better quality
 */
export async function uploadProductImage(file, tenantId, productId) {
  // Client-side resize + convert to WebP before upload
  const resizedBlob = await resizeAndConvertToWebP(file, 400, 400);

  const fileName = `${tenantId}/${productId}_${Date.now()}.webp`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(fileName, resizedBlob, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (uploadError) throw uploadError;

  // Public URL generate karo
  const { data } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);

  const publicUrl = data.publicUrl;

  // Products table mein image_url update karo
  const { error: dbError } = await supabase
    .from('products')
    .update({ image_url: publicUrl })
    .eq('id', productId);

  if (dbError) throw dbError;

  // Sync IndexedDB local cache
  try {
    await localDb.products.update(productId, { image_url: publicUrl });
  } catch (err) {
    console.warn('[uploadProductImage] localDb sync failed:', err.message);
  }

  return publicUrl;
}

/**
 * Delete product image from storage and optionally clear in products DB
 */
export async function deleteProductImage(imageUrl, tenantId, productId = null) {
  if (!imageUrl) return;

  // Extract file path from URL
  const path = imageUrl.split('/product-images/')[1];
  if (!path) return;

  const { error: removeError } = await supabase.storage
    .from('product-images')
    .remove([path]);

  if (removeError) {
    console.warn('[deleteProductImage] failed to remove file:', removeError.message);
  }

  if (productId) {
    const { error: dbError } = await supabase
      .from('products')
      .update({ image_url: null })
      .eq('id', productId);

    if (dbError) throw dbError;

    // Sync IndexedDB local cache
    try {
      await localDb.products.update(productId, { image_url: null });
    } catch (err) {
      console.warn('[deleteProductImage] localDb sync failed:', err.message);
    }
  }
}

/**
 * Canvas API se image resize karo aur WebP convert karo
 * 400x400 square thumbnail — cover fit (crop center)
 */
function resizeAndConvertToWebP(file, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      // Cover fit — center crop
      const scale = Math.max(width / img.width, height / img.height);
      const scaledW = img.width  * scale;
      const scaledH = img.height * scale;
      const offsetX = (width  - scaledW) / 2;
      const offsetY = (height - scaledH) / 2;

      ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        },
        'image/webp',
        0.85 // 85% quality — good balance
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}
