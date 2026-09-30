import { z } from 'zod';
import { COST_CATEGORIES } from './budget.schema';

export const RECEIPT_OCR_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const RECEIPT_OCR_MAX_BASE64_BYTES = 4 * Math.ceil(RECEIPT_OCR_MAX_IMAGE_BYTES / 3);
export const RECEIPT_OCR_MAX_TEXT_LENGTH = 12000;

export function stripDataUrlPrefix(value: string): string {
  return value.replace(/^data:image\/(?:png|jpeg);base64,/i, '');
}
export function isStandardBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}
export function approximateBase64ByteSize(value: string): number {
  return value.length * 3 / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}

export const receiptOcrRequestSchema = z.object({
  provider: z.enum(['local', 'minimax']).optional(),
  imageBase64: z.string().min(1).max(RECEIPT_OCR_MAX_BASE64_BYTES + 32)
    .refine(value => isStandardBase64(stripDataUrlPrefix(value)), { message: 'Invalid image base64' })
    .refine(value => approximateBase64ByteSize(stripDataUrlPrefix(value)) <= RECEIPT_OCR_MAX_IMAGE_BYTES,
      { message: 'Image exceeds 4 MiB' }),
});
export type ReceiptOcrRequest = z.infer<typeof receiptOcrRequestSchema>;
export const receiptOcrResponseSchema = z.object({
  category: z.enum(COST_CATEGORIES).optional(),
  name: z.string().min(1).max(120).optional(),
  amount: z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/).optional(),
  currency: z.literal('CNY').optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  text: z.string().max(RECEIPT_OCR_MAX_TEXT_LENGTH),
});
export type ReceiptOcrResponse = z.infer<typeof receiptOcrResponseSchema>;
