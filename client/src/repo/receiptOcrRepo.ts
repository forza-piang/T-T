import { scanReceipt } from '../api/receiptOcr';
import { isEffectivelyOffline } from '../sync/networkMode';

/** OCR runs on the NAS and is deliberately online-only; saving uses the normal expense queue. */
export const receiptOcrRepo = {
  async scan(tripId: number, file: File, signal?: AbortSignal, provider: 'local' | 'minimax' = 'local') {
    if (isEffectivelyOffline()) throw new Error('offline');
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('image');
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 24000000) throw new Error('image');
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('image');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
      if (!imageBase64 || signal?.aborted) throw new Error('cancelled');
      return scanReceipt(tripId, imageBase64, signal, provider);
    } finally { bitmap.close(); }
  },
};
