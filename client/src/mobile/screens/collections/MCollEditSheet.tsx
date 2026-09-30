import type { Collection, CollectionLink } from '@trek/shared';
import { Image, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../../components/shared/Toast';
import { normalizeLinkUrl } from '../../../pages/collections/collectionsModel';
import { useCollectionStore } from '../../../store/collectionStore';
import type { TranslationFn } from '../../../types';
import { getApiErrorMessage } from '../../../utils/apiError';
import MSheet from '../../components/MSheet';
import { listCoverGradient, SWATCH_COLORS } from './collectionsMobileModel';
import MCollLinksEditor from './MCollLinksEditor';
import { CancelPill, PrimaryPill, SheetFooter, SheetHeader, TEXTAREA_CLS } from './MCollSheetKit';

// Scrims over the cover photo — fixed dark overlays in both themes.
const COVER_OVERLAY =
  'absolute inset-0 flex items-center justify-center gap-[6px] bg-[rgba(0,0,0,.28)] text-[0.78125rem] font-bold text-white'; // theme-lint-disable

interface MCollEditSheetProps {
  /** null = closed, 'new' = create, a Collection = edit that list. */
  target: Collection | 'new' | null;
  onClose: () => void;
  onCreated: (id: number) => void;
  /** Owner-only: hands the id to the delete-confirm flow (sheet closes first). */
  onRequestDelete: (id: number) => void;
  t: TranslationFn;
}

/**
 * Create / edit a list: cover upload, name, colour,
 * description and links. Deleting goes through the shared confirm flow.
 */
export default function MCollEditSheet({ target, onClose, onCreated, onRequestDelete, t }: MCollEditSheetProps) {
  const createCollection = useCollectionStore((s) => s.createCollection);
  const updateCollection = useCollectionStore((s) => s.updateCollection);
  const uploadCover = useCollectionStore((s) => s.uploadCover);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Hold the last target through the exit animation.
  const [held, setHeld] = useState<Collection | 'new' | null>(target);
  if (target && target !== held) setHeld(target);
  const editing = held && held !== 'new' ? held : null;

  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCH_COLORS[0]);
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState<CollectionLink[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A create that failed at the cover step keeps its id so a retry updates it.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const objectUrl = useRef<string | null>(null);

  const dropObjectUrl = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };

  // (Re)seed the form whenever the sheet opens on a target.
  useEffect(() => {
    if (!target) return;
    const edit = target !== 'new' ? target : null;
    setName(edit?.name ?? '');
    setColor(edit?.color ?? SWATCH_COLORS[0]);
    setDescription(edit?.description ?? '');
    setLinks(edit?.links ?? []);
    setCoverFile(null);
    dropObjectUrl();
    setCoverPreview(edit?.cover_image ?? null);

    setCreatedId(null);
  }, [target]);

  useEffect(() => () => dropObjectUrl(), []);

  // A create that only failed at the cover step already produced the list —
  // hand it over on the way out instead of leaving it behind unnoticed.
  const close = () => {
    if (createdId != null) onCreated(createdId);
    onClose();
  };

  const pickCover = (file: File | undefined) => {
    if (!file) return;
    dropObjectUrl();
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setCoverFile(file);
    setCoverPreview(url);

  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    const cleanLinks = links
      .map((l) => ({ label: l.label?.trim() || undefined, url: normalizeLinkUrl(l.url) }))
      .filter((l) => l.url);
    const payload = {
      name: trimmed,
      color,
      description: description.trim() || null,
      links: cleanLinks,
    };
    setSaving(true);
    try {
      let id = editing?.id ?? createdId;
      if (id != null) {
        await updateCollection(id, payload);
      } else {
        const created = await createCollection(payload);
        id = created?.id ?? null;
        setCreatedId(id);
      }
      if (id != null && coverFile) await uploadCover(id, coverFile);
      if (!editing && id != null) onCreated(id);
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const label = 'mb-[5px] font-geist text-[0.6875rem] font-bold text-m-muted';
  const canDeleteList = editing != null && editing.is_owner !== false;

  return (
    <MSheet
      open={target != null}
      onClose={close}
      material="opaque"
      ariaLabel={editing ? t('collections.editListTitle') : t('collections.newList')}
    >
      <SheetHeader
        title={editing ? t('collections.editListTitle') : t('collections.newList')}
        onClose={close}
        closeLabel={t('common.close')}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[14px]">
        <div className={label}>{t('collections.coverImage')}</div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative block h-[120px] w-full overflow-hidden rounded-[14px]"
          style={coverPreview ? undefined : { background: listCoverGradient(color) }}
        >
          {coverPreview && <img src={coverPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <span className={COVER_OVERLAY}>
            <Image size={14} strokeWidth={2.2} />{' '}
            {coverPreview ? t('collections.changeCover') : t('collections.addCover')}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => pickCover(e.target.files?.[0])}
        />
        <div className={`${label} mt-[14px]`}>{t('collections.listName')}</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('collections.listNamePlaceholder')}
          className="box-border w-full rounded-[12px] border-[1.5px] border-[color:var(--m-rowbr)] bg-[color:var(--m-sheet)] px-[13px] py-[11px] font-[inherit] text-[0.84375rem] font-semibold text-m-ink outline-none placeholder:text-m-faint"
        />

        <div className={`${label} mb-[6px] mt-[14px]`}>{t('collections.listColor')}</div>
        <div className="flex flex-wrap gap-2">
          {SWATCH_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => setColor(col)}
              aria-label={col}
              aria-pressed={color === col}
              className={`h-[26px] w-[26px] rounded-full ${color === col ? 'outline outline-2 outline-offset-2 outline-[color:var(--m-act)]' : ''}`}
              style={{ background: col }}
            />
          ))}
        </div>

        <div className={`${label} mt-[14px]`}>{t('collections.description')}</div>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('collections.descriptionPlaceholder')}
          className={TEXTAREA_CLS}
        />

        <div className={`${label} mt-[14px]`}>{t('collections.links')}</div>
        <MCollLinksEditor links={links} onChange={setLinks} t={t} />
      </div>
      <SheetFooter>
        {canDeleteList && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onRequestDelete(editing!.id);
            }}
            className="flex items-center gap-[5px] text-[0.75rem] font-bold text-[color:var(--m-st-danger)]"
          >
            <Trash2 size={13} strokeWidth={2} /> {t('collections.deleteList')}
          </button>
        )}
        <CancelPill className="ml-auto" onClick={close}>
          {t('common.cancel')}
        </CancelPill>
        <PrimaryPill onClick={save} disabled={!name.trim() || saving}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          {editing ? t('common.save') : t('collections.create')}
        </PrimaryPill>
      </SheetFooter>
    </MSheet>
  );
}
