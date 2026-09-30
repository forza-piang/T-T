import { describe, expect, it } from 'vitest';
import { receiptOcrRequestSchema, receiptOcrResponseSchema, RECEIPT_OCR_MAX_IMAGE_BYTES } from './receipt-ocr.schema';
describe('receipt OCR body', () => {
  it.each(['=', 'abc', 'a===', 'data:text/html;base64,YQ==', '!!!!'])('rejects malformed base64 %s', imageBase64 => {
    expect(receiptOcrRequestSchema.safeParse({ imageBase64 }).success).toBe(false);
  });
  it('accepts exact decoded byte cap and rejects one extra byte', () => {
    expect(receiptOcrRequestSchema.safeParse({ imageBase64: zeroBase64(RECEIPT_OCR_MAX_IMAGE_BYTES) }).success).toBe(true);
    expect(receiptOcrRequestSchema.safeParse({ imageBase64: zeroBase64(RECEIPT_OCR_MAX_IMAGE_BYTES + 1) }).success).toBe(false);
  });
});

it('allows only explicit local or MiniMax provider choices', () => {
  const imageBase64='YQ==';
  expect(receiptOcrRequestSchema.parse({imageBase64}).provider).toBeUndefined();
  expect(receiptOcrRequestSchema.parse({imageBase64,provider:'minimax'}).provider).toBe('minimax');
  expect(receiptOcrRequestSchema.safeParse({imageBase64,provider:'https://example.com'}).success).toBe(false);
});

it('accepts canonical optional categories and rejects arbitrary values', () => {
 expect(receiptOcrResponseSchema.parse({text:'',category:'parking'}).category).toBe('parking');
 expect(receiptOcrResponseSchema.parse({text:''}).category).toBeUndefined();
 expect(receiptOcrResponseSchema.safeParse({text:'',category:'餐饮'}).success).toBe(false);
});

function zeroBase64(bytes: number): string {
  return 'AAAA'.repeat(Math.floor(bytes / 3)) + ['', 'AA==', 'AAA='][bytes % 3];
}
