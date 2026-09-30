import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { ReceiptOcrService } from '../../../src/nest/budget/receipt-ocr.service';
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
const png = Buffer.alloc(24);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR',12); png.writeUInt32BE(900,16); png.writeUInt32BE(1100,20);
const fakeChild = { stdin: { on: vi.fn(), end: vi.fn() }, kill: vi.fn() };
beforeEach(() => vi.resetAllMocks());
describe('local receipt OCR service', () => {
  it('pipes the actual image to a fixed command with timeout and output caps', async () => {
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const done = args[3] as (e: Error | null, out: string) => void;
      fakeChild.stdin.end.mockImplementation(() => done(null, '支付成功\n¥128.50\n付款时间 2026-09-28'));
      return fakeChild as never;
    });
    const result = await new ReceiptOcrService().scan(png.toString('base64'));
    expect(fakeChild.stdin.end).toHaveBeenCalledWith(png);
    expect(execFile).toHaveBeenCalledWith('tesseract', ['stdin', 'stdout', '-l', 'chi_sim+eng', '--psm', '6'],
      expect.objectContaining({ timeout: 30000, maxBuffer: 262144, killSignal: 'SIGKILL' }), expect.any(Function));
    expect(result).toMatchObject({ amount: '128.50', currency: 'CNY', date: '2026-09-28' });
  });
  it('refuses unknown image types and huge dimensions before any decoder runs', async () => {
    const svc = new ReceiptOcrService();
    await expect(svc.scan(Buffer.from('not image').toString('base64'))).rejects.toMatchObject({ status: 400 });
    const huge = Buffer.from(png); huge.writeUInt32BE(100000,16);
    await expect(svc.scan(huge.toString('base64'))).rejects.toMatchObject({ status: 400 });
    expect(execFile).not.toHaveBeenCalled();
  });
  it('rejects excess concurrent requests instead of retaining an unbounded queue', async () => {
    const callbacks: Array<(err: Error | null, out: string) => void> = [];
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      callbacks.push(args[3] as (err: Error | null, out: string) => void); return fakeChild as never;
    });
    const svc = new ReceiptOcrService();
    const first = svc.scan(png.toString('base64')), second = svc.scan(png.toString('base64'));
    await expect(svc.scan(png.toString('base64'))).rejects.toMatchObject({ status: 429 });
    callbacks.forEach(cb => cb(null, ''));
    await Promise.all([first, second]);
  });
  it('sanitizes engine errors and releases capacity', async () => {
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const done = args[3] as (e: Error | null, out: string) => void;
      fakeChild.stdin.end.mockImplementation(() => done(Object.assign(new Error('secret stderr'), { code: 'ENOENT' }), ''));
      return fakeChild as never;
    });
    const svc = new ReceiptOcrService();
    await expect(svc.scan(png.toString('base64'))).rejects.toMatchObject({ status: 503, message: 'OCR engine unavailable' });
    await expect(svc.scan(png.toString('base64'))).rejects.toMatchObject({ status: 503 });
  });
});
