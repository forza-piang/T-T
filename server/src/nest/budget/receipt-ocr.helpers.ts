import { RECEIPT_OCR_MAX_TEXT_LENGTH, type CostCategory, type ReceiptOcrResponse } from '@trek/shared';

export type ParsedReceipt = Omit<ReceiptOcrResponse, 'text'>;
const MONEY = String.raw`(?:\d{1,3}(?:,\d{3})+|\d{1,9})(?:\.\d{1,2})?`;
const NOT_PAID = /退款|待支付|待付款|未付款|支付失败|已撤销|已失效|交易关闭|已关闭|等待付款|等待买家付款/;
const META_LABEL = /^(付款时间|支付时间|交易时间|订单号|商户单号|交易单号|支付方式|付款方式|金额|实付|收款方)/;

export function trimOcrText(text: string): string {
  return text.slice(0, RECEIPT_OCR_MAX_TEXT_LENGTH);
}

/** Conservative payment fields only. Refunds and ambiguous totals require manual entry. */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const text = trimOcrText(rawText).normalize('NFKC')
    .replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, '$1');
  if (NOT_PAID.test(text)) return {};
  const result: ParsedReceipt = {};
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const amount = parseAmount(lines);
  if (amount) { result.amount = amount; result.currency = 'CNY'; }
  const date = parseDate(lines);
  if (date) result.date = date;
  for (let i = 0; i < lines.length; i++) {
    const match = /^(?:收款方|商户名称|商家名称|商品说明|商户|商品|支付给|收款人|商家)[ :：]*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const candidate = (match[1] || lines[i + 1] || '').trim();
    if (candidate && candidate.length <= 120 && !META_LABEL.test(candidate) && !/^[\d¥￥$]/.test(candidate)) {
      result.name = candidate; break;
    }
  }
  if (result.name) result.category = suggestReceiptCategory(result.name);
  if (!result.category) delete result.category;
  return result;
}

function oneAmount(values: string[]): string | undefined {
  const unique = [...new Set(values.map(formatAmount).filter((v): v is string => !!v))];
  return unique.length === 1 ? unique[0] : undefined;
}

function parseAmount(lines: string[]): string | undefined {
  if (lines.some(line => /USD|HKD|JPY|美元|港币|日元|円|\$|€/i.test(line))) return undefined;
  const preferred: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const label = /(?:实付(?:款|金额)?|支付金额|付款金额|实际支付)[ :：]*(.*)$/.exec(lines[i]);
    if (!label) continue;
    const value = label[1].trim() || lines[i + 1] || '';
    const match = new RegExp(String.raw`^[¥￥]?\s*-?\s*(${MONEY})(?![\d.,])\s*(?:元|CNY|RMB)?\s*$`, 'i').exec(value);
    if (match) preferred.push(match[1]);
  }
  if (preferred.length) return oneAmount(preferred);
  const amounts: string[] = [];
  for (const line of lines) {
    if (/优惠|折扣|立减|原价|总价|合计|订单|单号|流水/.test(line)) continue;
    const re = new RegExp(String.raw`[¥￥]\s*-?\s*(${MONEY})(?![\d.,])|(${MONEY})(?![\d.,])\s*(?:元|CNY|RMB)`, 'gi');
    for (const match of line.matchAll(re)) amounts.push(match[1] || match[2]);
  }
  return oneAmount(amounts);
}

export function formatAmount(raw: string): string | undefined {
  const normalized = raw.replace(/,/g, '');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) return undefined;
  const [whole, fraction = ''] = normalized.split('.');
  return `${Number(whole)}.${fraction.padEnd(2, '0')}`;
}

function parseDate(lines: string[]): string | undefined {
  const labeled: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/(?:付款|支付|交易|完成)(?:时间|日期)/.test(lines[i])) labeled.push(lines[i] + ' ' + (lines[i + 1] || ''));
  }
  for (const text of [...labeled, ...lines]) {
    const match = /\b(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})(?!\d)/.exec(text);
    if (!match) continue;
    const candidate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const date = new Date(candidate + 'T00:00:00Z');
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate) return candidate;
  }
  return undefined;
}

// Only inspect the explicitly extracted merchant/product, not bank or payment metadata.
const CATEGORY_WORDS: ReadonlyArray<readonly [CostCategory, RegExp]> = [
  ['accommodation', /酒店|旅馆|宾馆|民宿|客栈/],
  ['food', /餐厅|餐饮|饭店|火锅|烧烤|小吃|面馆|咖啡|奶茶|茶饮|麦当劳|肯德基/],
  ['groceries', /超市|便利店|菜市场|生鲜|水果店/],
  ['transport', /出租车|网约车|滴滴出行|公交|地铁|火车票|高铁票|铁路12306|租车/],
  ['flights', /机票|航空公司/],
  ['activities', /电影院|电影票|游乐园|主题乐园|演唱会/],
  ['sightseeing', /博物馆|景区|动物园|海洋公园|美术馆/],
  ['shopping', /服装店|鞋店|书店|百货商场|纪念品/],
  ['fees', /手续费|签证费|服务费/],
  ['health', /医院|诊所|药房|药店/],
  ['tips', /小费/],
  ['fuel', /加油站|加油费/],
  ['parking', /停车场|停车费/],
];
export function suggestReceiptCategory(merchant: string): CostCategory | undefined {
  const matches = CATEGORY_WORDS.filter(([, pattern]) => pattern.test(merchant));
  return matches.length === 1 ? matches[0][0] : undefined;
}
