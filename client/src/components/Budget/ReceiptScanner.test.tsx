import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../tests/helpers/render';
import { receiptOcrRepo } from '../../repo/receiptOcrRepo';
import ReceiptScanner from './ReceiptScanner';
vi.mock('../../repo/receiptOcrRepo', () => ({ receiptOcrRepo: { scan: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
describe('ReceiptScanner', () => {
  it('previews fields and only applies them after an explicit click', async () => {
    const result = { name: '海星餐厅', category: 'food' as const, amount: '128.50', currency: 'CNY' as const, date: '2026-09-28', text: '实付 128.50元' };
    vi.mocked(receiptOcrRepo.scan).mockResolvedValue(result);
    const apply = vi.fn(); render(<ReceiptScanner tripId={1} onApply={apply} />);
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), new File(['test'], 'payment.png', { type: 'image/png' }));
    await screen.findByRole('button', { name: 'Apply recognized fields' }); expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText('Category: Food & drink')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply recognized fields' }));
    expect(apply).toHaveBeenCalledExactlyOnceWith(result);
  });
  it('shows failure without applying any fields', async () => {
    vi.mocked(receiptOcrRepo.scan).mockRejectedValue(new Error('offline'));
    const apply = vi.fn(); render(<ReceiptScanner tripId={1} onApply={apply} />);
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), new File(['test'], 'payment.jpg', { type: 'image/jpeg' }));
    await screen.findByRole('alert'); expect(apply).not.toHaveBeenCalled();
  });
  it('cancels a pending scan when the modal unmounts', async () => {
    vi.mocked(receiptOcrRepo.scan).mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(<ReceiptScanner tripId={1} onApply={vi.fn()} />);
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), new File(['test'], 'payment.png', { type: 'image/png' }));
    await waitFor(() => expect(receiptOcrRepo.scan).toHaveBeenCalled());
    const signal = vi.mocked(receiptOcrRepo.scan).mock.calls[0][2];
    unmount(); expect(signal?.aborted).toBe(true);
  });
});

it('defaults to MiniMax and allows switching to local recognition', async () => {
  vi.mocked(receiptOcrRepo.scan).mockResolvedValue({text:'',amount:'1.00',currency:'CNY'});
  render(<ReceiptScanner tripId={1} onApply={vi.fn()} />);
  expect(screen.getByRole('checkbox',{name:'MiniMax M3'})).toBeChecked();
  expect(screen.getByText(/Sends this screenshot to MiniMax/)).toBeInTheDocument();
  const input = screen.getByTestId('receipt-scan-input');
  await userEvent.upload(input,new File(['test'],'a.png',{type:'image/png'}));
  await waitFor(()=>expect(receiptOcrRepo.scan).toHaveBeenCalledWith(1,expect.any(File),expect.any(AbortSignal),'minimax'));
  await userEvent.click(screen.getByRole('checkbox',{name:'MiniMax M3'}));
  expect(screen.getByRole('checkbox',{name:'MiniMax M3'})).not.toBeChecked();
  expect(screen.queryByText(/Sends this screenshot to MiniMax/)).not.toBeInTheDocument();
  await userEvent.upload(input,new File(['test'],'b.png',{type:'image/png'}));
  await waitFor(()=>expect(receiptOcrRepo.scan).toHaveBeenLastCalledWith(1,expect.any(File),expect.any(AbortSignal),'local'));
});
