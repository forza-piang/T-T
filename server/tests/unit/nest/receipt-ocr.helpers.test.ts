import { describe, expect, it } from 'vitest';
import { parseReceiptText } from '../../../src/nest/budget/receipt-ocr.helpers';
describe('payment screenshot parsing', () => {
  it('recognizes actual OCR output without inventing an unlabelled merchant', () => {
    expect(parseReceiptText('支付成功\n¥128.50\nKER 海星餐厅\n付款时间\n2026-09-28 12:30:00')).toEqual({ amount: '128.50', currency: 'CNY', date: '2026-09-28' });
  });
  it('prefers actual payment, supports spaced Chinese, same-line merchant and thousands', () => {
    expect(parseReceiptText('原价 ¥1,300.50\n优惠 ¥20.00\n实 付 金 额 ￥1,280.50\n收 款 方：海星餐厅\n支付时间 2026年9月28日')).toEqual({ amount: '1280.50', currency: 'CNY', name: '海星餐厅', category: 'food', date: '2026-09-28' });
  });
  it('supports merchant and payment labels on separate lines', () => {
    expect(parseReceiptText('收款方\n海星餐厅\n实付\n128.50元')).toEqual({ name: '海星餐厅', category: 'food', amount: '128.50', currency: 'CNY' });
  });
  it.each(['退款成功 ¥128.50', '待支付 ¥128.50', '支付失败 ¥128.50'])('does not import %s as a positive expense', text => {
    expect(parseReceiptText(text)).toEqual({});
  });
  it.each(['订单号 12850000', '优惠 ¥20.00', '¥20.00\n¥128.50', 'USD $128.50', '¥1,2345.00'])('leaves ambiguous money blank: %s', text => {
    expect(parseReceiptText(text).amount).toBeUndefined();
  });
  it('does not turn another field into a merchant or accept an impossible date', () => {
    expect(parseReceiptText('收款方\n支付方式 银行卡\n2026-02-30')).toEqual({});
  });
});

it.each([
 ['海星餐厅','food'], ['如家酒店','accommodation'], ['人民停车场','parking'],
 ['海星超市','groceries'], ['人民药房','health'], ['中石化加油站','fuel'],
 ['海星公司',undefined], ['酒店餐厅',undefined], ['加油站便利店',undefined],
])('conservatively suggests category for %s', (name, category) => {
 expect(parseReceiptText(`收款方：${name}\n实付 28元`).category).toBe(category);
});
it('does not classify payment metadata or refunded purchases', () => {
 expect(parseReceiptText('收款方 海星公司\n付款方式 交通银行').category).toBeUndefined();
 expect(parseReceiptText('退款成功\n收款方 海星餐厅')).toEqual({});
});
