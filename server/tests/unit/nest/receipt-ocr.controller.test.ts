import { it, expect, vi } from 'vitest';
import { ReceiptOcrController } from '../../../src/nest/budget/receipt-ocr.controller';
import { OcrServiceError } from '../../../src/nest/budget/receipt-ocr.service';
import type { User } from '../../../src/types';
it.each([400, 429, 503])('preserves sanitized OCR error status %s', async status => {
  const service = { scan: vi.fn().mockRejectedValue(new OcrServiceError(status, 'Unable to scan')) };
  const controller = new ReceiptOcrController(service as never, { scan: vi.fn() } as never);
  await expect(controller.scan({ id: 1 } as User, '1', { imageBase64: 'test' })).rejects.toMatchObject({ status, response: { error: 'Unable to scan' } });
});

it('only routes explicitly selected scans to MiniMax', async () => {
  const local={scan:vi.fn().mockResolvedValue({text:''})}, cloud={scan:vi.fn().mockResolvedValue({text:''})};
  const controller=new ReceiptOcrController(local as never,cloud as never);
  await controller.scan({id:1} as User,'1',{imageBase64:'test'});
  expect(cloud.scan).not.toHaveBeenCalled();
  await controller.scan({id:1} as User,'1',{imageBase64:'test',provider:'minimax'});
  expect(cloud.scan).toHaveBeenCalledExactlyOnceWith('test'); expect(local.scan).toHaveBeenCalledTimes(1);
});
