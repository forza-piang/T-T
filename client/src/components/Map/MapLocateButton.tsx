import { LocateFixed, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GeoOnceError, getCurrentPositionOnce, type GeoPosition } from '../../hooks/useGeolocation';
import { useTranslation } from '../../i18n';

export default function MapLocateButton({ onPosition, right = 12, disabled = false }: {
  onPosition: (position: GeoPosition) => void; right?: number; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const locate = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const position = await getCurrentPositionOnce();
      if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) throw new GeoOnceError('unavailable');
      if (active.current) onPosition(position);
    } catch (err) {
      const code = err instanceof GeoOnceError ? err.code : 'unavailable';
      const key = code === 'permission-denied' ? 'journey.editor.locationPermissionDenied'
        : code === 'timeout' ? 'journey.editor.locationTimeout'
        : code === 'insecure-context' ? 'journey.editor.locationInsecureContext'
        : 'journey.editor.locationUnavailable';
      if (active.current) setError(key);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return <div style={{position:'absolute',top:72,right,zIndex:1000,display:'flex',alignItems:'flex-end',flexDirection:'column',gap:8}}>
    <button type="button" onClick={() => void locate()} disabled={disabled || busy} aria-busy={busy}
      aria-label={t('journey.editor.useCurrentLocation')} title={t('journey.editor.useCurrentLocation')}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-edge bg-surface text-content shadow-lg disabled:opacity-60">
      {busy ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={20} aria-hidden="true" />}
    </button>
    {busy && <span role="status" className="rounded-lg bg-surface px-3 py-2 text-xs text-content shadow">{t('common.loading')}</span>}
    {error && <div role="alert" className="max-w-60 rounded-lg border border-edge bg-surface p-3 text-sm text-danger shadow">{t(error)}</div>}
  </div>;
}
