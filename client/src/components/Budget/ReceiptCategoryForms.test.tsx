import { beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { receiptOcrRepo } from '../../repo/receiptOcrRepo';
import { ExpenseModal } from './CostsPanel';
import MCostSheet from '../../mobile/screens/trip/sheets/MCostSheet';
vi.mock('../../repo/receiptOcrRepo', () => ({ receiptOcrRepo: { scan: vi.fn() } }));
beforeEach(() => { resetAllStores(); vi.clearAllMocks(); });
for (const mobile of [false, true]) {
 it.each(['parking' as const, undefined])(`${mobile ? 'mobile' : 'desktop'} applies category %s, keeps unknown and permits manual correction`, async category => {
   vi.mocked(receiptOcrRepo.scan).mockResolvedValue({text:'',name:'测试商户',category});
   const Form = mobile ? MCostSheet : ExpenseModal;
   render(<Form tripId={1} base="CNY" people={[{id:1,username:'alice',avatar_url:null}]} me={1} editing={null}
     prefill={{category:'shopping'}} onClose={vi.fn()} onSaved={vi.fn()} />);
   await userEvent.upload(screen.getByTestId('receipt-scan-input'), new File(['test'],'payment.png',{type:'image/png'}));
   await userEvent.click(await screen.findByRole('button',{name:'Apply recognized fields'}));
   const expected = category ? 'Parking' : 'Shopping';
   if (mobile) {
     await userEvent.click(screen.getByRole('button',{name:expected}));
   }
   expect(screen.getByRole('button',{name:expected,pressed:true})).toBeInTheDocument();
   await userEvent.click(screen.getByRole('button',{name:'Food & drink'}));
   if (mobile) await userEvent.click(screen.getByRole('button',{name:'Food & drink'}));
   expect(screen.getByRole('button',{name:'Food & drink',pressed:true})).toBeInTheDocument();
 });
}
