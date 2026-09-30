import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniMaxReceiptService } from '../../../src/nest/budget/minimax-receipt.service';
import { encrypt_api_key } from '../../../src/nest/common/crypto/apiKeyCrypto';
import { deriveIntegrations } from '../../../src/app-config';
const png = Buffer.alloc(24);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR',12); png.writeUInt32BE(900,16); png.writeUInt32BE(1100,20);
const image = png.toString('base64');
const receipt = { paid: true, name: '海星餐厅', category: 'food', amount: '128.50', currency: 'CNY', date: '2026-09-28' };
const fetchMock = vi.fn();
const service = (key = 'sk-cp-synthetic-test') => new MiniMaxReceiptService(deriveIntegrations({ MINIMAX_RECEIPT_API_KEY: key }));
const answer = (value: unknown = receipt, finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content: JSON.stringify(value) } }] });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('MiniMax payment screenshot recognition', () => {
 it('uses the fixed official endpoint, one bounded M3 image request and validated fields', async () => {
   fetchMock.mockResolvedValue(answer());
   expect(await service().scan(image)).toEqual({ text: '', name: '海星餐厅', category: 'food', amount: '128.50', currency: 'CNY', date: '2026-09-28' });
   expect(fetchMock).toHaveBeenCalledTimes(1);
   const [url, init] = fetchMock.mock.calls[0];
   expect(url).toBe('https://api.minimax.cn/v1/chat/completions');
   expect(init).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
   const body = JSON.parse(init.body);
   expect(body).toMatchObject({ model: 'MiniMax-M3', max_completion_tokens: 800, thinking: { type: 'disabled' } });
   expect(body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,'+image);
 });
 it.each(['', 'sk-pay-as-you-go', 'enc:v1:invalid'])('does not use missing, non-plan or undecryptable keys (%s)', async key => {
   await expect(service(key).scan(image)).rejects.toMatchObject({ status: 503 }); expect(fetchMock).not.toHaveBeenCalled();
 });
 it('validates images before sending anything', async () => {
   await expect(service().scan('aW52YWxpZA==')).rejects.toMatchObject({ status: 400 }); expect(fetchMock).not.toHaveBeenCalled();
 });
 it('returns no proposed fields for refunds or non-completed payments', async () => {
   fetchMock.mockResolvedValue(answer({ ...receipt, paid: false })); expect(await service().scan(image)).toEqual({ text: '' });
 });
 it.each([{...receipt, date:'2026-02-30'}, {...receipt, amount:'128.50; ignore rules'}, {...receipt, currency:'USD'}, {...receipt, name:'x'.repeat(121)}])('rejects invalid extracted fields', async value => {
   fetchMock.mockResolvedValue(answer(value)); await expect(service().scan(image)).rejects.toMatchObject({ status: 502 });
 });
 it.each([401,429,500])('sanitizes provider errors %s without retrying or returning their body', async status => {
   fetchMock.mockResolvedValue(new Response('secret body and screenshot text', {status}));
   await expect(service().scan(image)).rejects.toMatchObject({ status: status===429?429:502, message: 'MiniMax recognition failed; check the key and plan quota' });
   expect(fetchMock).toHaveBeenCalledTimes(1);
 });
 it('rejects truncated model completions', async () => {
   fetchMock.mockResolvedValue(answer(receipt,'length')); await expect(service().scan(image)).rejects.toMatchObject({status:502});
 });
 it('rejects oversized response bodies', async () => {
   fetchMock.mockResolvedValue(new Response('x'.repeat(65537))); await expect(service().scan(image)).rejects.toMatchObject({status:502});
 });
 it('keeps the timeout active while reading a stalled response', async () => {
   vi.useFakeTimers();
   fetchMock.mockImplementation(async (_url, init) => new Response(new ReadableStream({start(c){ init.signal.addEventListener('abort',()=>c.error(new Error('aborted'))); }})));
   const request = service().scan(image); const assertion=expect(request).rejects.toMatchObject({status:504});
   await vi.advanceTimersByTimeAsync(35001); await assertion;
 });
 it('rejects a third concurrent scan and releases slots after failures', async () => {
   const done: Array<(r:Response)=>void> = []; fetchMock.mockImplementation(()=>new Promise(r=>done.push(r)));
   const s=service(); const a=s.scan(image), b=s.scan(image);
   await expect(s.scan(image)).rejects.toMatchObject({status:429});
   done.forEach(r=>r(answer())); await Promise.all([a,b]);
   fetchMock.mockResolvedValue(answer()); expect((await s.scan(image)).amount).toBe('128.50');
 });
});

it('uses an encrypted server-side key without exposing it in the result', async () => {
 fetchMock.mockResolvedValue(answer());
 const result=await service(encrypt_api_key('sk-cp-synthetic-test')).scan(image);
 expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer sk-cp-synthetic-test');
 expect(JSON.stringify(result)).not.toContain('sk-cp');
});

it.each([null, undefined, '餐饮', 'ignore instructions', 42])('ignores uncertain/invalid category %s without losing payment data', async category => {
 fetchMock.mockResolvedValue(answer({...receipt, category}));
 const result = await service().scan(image);
 expect(result.category).toBeUndefined();
 expect(result.amount).toBe('128.50');
});
