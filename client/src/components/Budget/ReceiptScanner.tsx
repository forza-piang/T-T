import { useEffect, useRef, useState } from 'react';
import type { ReceiptOcrResponse } from '@trek/shared';
import { useTranslation } from '../../i18n';
import { catMeta } from './costsCategories';
import { receiptOcrRepo } from '../../repo/receiptOcrRepo';

export default function ReceiptScanner({ tripId, onApply }: { tripId: number; onApply: (result: ReceiptOcrResponse) => void }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [cloud, setCloud] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<ReceiptOcrResponse | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const scan = async (file: File) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(false); setResult(null);
    try {
      const data = await receiptOcrRepo.scan(tripId, file, controller.signal, cloud ? 'minimax' : 'local');
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className="mb-3 space-y-2 rounded-xl border border-edge bg-surface p-3">
    <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" data-testid="receipt-scan-input"
      onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void scan(file); }} />
    <label className="flex items-center gap-2 text-sm text-content">
      <input type="checkbox" checked={cloud} disabled={busy} onChange={e => { setCloud(e.target.checked); setResult(null); setError(false); }} />
      MiniMax M3
    </label>
    <button type="button" disabled={busy} onClick={() => input.current?.click()}
      className="rounded-lg border border-edge px-3 py-2 text-sm font-medium text-content disabled:opacity-50">
      {busy ? t('common.loading') : t('costs.scanReceipt')}
    </button>
    <p className="text-xs text-content-muted">{t(cloud ? 'costs.scanReceiptCloudHint' : 'costs.scanReceiptHint')}</p>
    {error && <p role="alert" className="text-sm text-danger">{t('costs.scanReceiptFailed')}</p>}
    {result && <div className="space-y-2 text-sm text-content" aria-live="polite">
      {result.name && <p>{t('costs.whatFor')}: {result.name}</p>}
      {result.amount && <p>{t('costs.totalAmount')}: {result.currency ?? ''} {result.amount}</p>}
      {result.date && <p>{t('common.date')}: {result.date}</p>}
      {result.category && <p>{t('costs.category')}: {t(catMeta(result.category).labelKey)}</p>}
      {result.text && <details><summary>{t('costs.receipts')}</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{result.text}</pre></details>}
      {(result.name || result.amount || result.date || result.category) ? <button type="button" className="rounded-lg border border-edge px-3 py-2 font-medium"
        onClick={() => { onApply(result); setResult(null); }}>{t('costs.scanReceiptApply')}</button>
        : <p>{t('costs.scanReceiptFailed')}</p>}
    </div>}
  </div>;
}
