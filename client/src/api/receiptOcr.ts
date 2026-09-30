import apiClient from './client';
import { receiptOcrResponseSchema, type ReceiptOcrResponse } from '@trek/shared';

export async function scanReceipt(tripId: number, imageBase64: string, signal?: AbortSignal, provider: 'local' | 'minimax' = 'local'): Promise<ReceiptOcrResponse> {
  const res = await apiClient.post(`/trips/${tripId}/budget/scan-receipt`, { imageBase64, provider }, { signal, timeout: 45000 });
  return receiptOcrResponseSchema.parse(res.data);
}
