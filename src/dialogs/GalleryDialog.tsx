import { useCallback, useEffect, useRef, useState } from 'react';
import Dialog from './Dialog';
import type { GalleryImageAttrs } from '../editor/extensions';
import { ACCEPT, addImage, ImageError, MAX_IMAGES } from '../uploads';
import { Close, Upload } from '../icons';
import { pluralize } from '../date';

interface Pending {
  key: string;
  name: string;
  error: string | null;
}

/**
 * Фото в текст: выбрать с компьютера (кнопкой, перетаскиванием, вставкой скриншота), поменять
 * порядок перетаскиванием, убрать лишние. На сервер ничего не уходит — фото видны сразу, а
 * отправятся вместе с публикацией. Всего в публикации — не больше MAX_IMAGES.
 */
export default function GalleryDialog({
  initial,
  limit,
  onDone,
}: {
  initial: GalleryImageAttrs[];
  /** сколько фото может быть в этой галерее (20 минус фото в остальном тексте) */
  limit: number;
  onDone: (images: GalleryImageAttrs[] | null) => void;
}) {
  const [images, setImages] = useState<GalleryImageAttrs[]>(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const countRef = useRef(initial.length);
  countRef.current = images.length + pending.filter((p) => !p.error).length;

  const add = useCallback(
    (list: FileList | File[]) => {
      setNotice('');
      const room = limit - countRef.current;
      const files = Array.from(list).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      if (room <= 0) {
        setNotice(`В публикации может быть не больше ${MAX_IMAGES} фото`);
        return;
      }
      if (files.length > room) setNotice(`Добавлены первые ${pluralize(room, ['фото', 'фото', 'фото'])}: в публикации — не больше ${MAX_IMAGES}`);
      // по очереди: фото встают в том порядке, в каком их выбрали
      const batch = files.slice(0, room).map((file) => ({ file, tmp: `p${Math.random().toString(36).slice(2)}` }));
      setPending((p) => [...p, ...batch.map(({ file, tmp }) => ({ key: tmp, name: file.name, error: null }))]);
      void (async () => {
        for (const { file, tmp } of batch) {
          try {
            const { key, url } = await addImage(file);
            setPending((p) => p.filter((x) => x.key !== tmp));
            setImages((cur) => [...cur, { id: null, upload: key, src: url, thumb: url, preload: null }]);
          } catch (e) {
            const msg = e instanceof ImageError ? e.message : 'Не получилось открыть файл';
            setPending((p) => p.map((x) => (x.key === tmp ? { ...x, error: msg } : x)));
          }
        }
      })();
    },
    [limit],
  );

  // вставка скриншота из буфера
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        add(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [add]);

  // перестановка
  const dragIdx = useRef<number | null>(null);
  const move = (from: number, to: number) =>
    setImages((cur) => {
      const next = cur.slice();
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });

  const busy = pending.some((p) => !p.error);
  const left = limit - images.length;

  return (
    <Dialog
      title={initial.length ? 'Фото в тексте' : 'Добавить фото'}
      size="wide"
      onClose={() => onDone(null)}
      footer={
        <>
          <span className="pe-gal-count">
            {images.length
              ? `${pluralize(images.length, ['фото', 'фото', 'фото'])} · можно добавить ещё ${Math.max(0, left)}`
              : `До ${pluralize(limit, ['фото', 'фото', 'фото'])}. Порядок меняется перетаскиванием`}
          </span>
          <button type="button" className="pe-btn pe-btn-ghost" onClick={() => onDone(null)}>
            Отмена
          </button>
          <button
            type="button"
            className="pe-btn pe-btn-primary"
            disabled={busy || (!images.length && !initial.length)}
            onClick={() => onDone(images)}
          >
            {busy ? <span className="pe-spinner" aria-hidden="true" /> : null}
            {initial.length ? (images.length ? 'Сохранить' : 'Убрать фото') : 'Вставить'}
          </button>
        </>
      }
    >
      <div
        className="pe-gal"
        data-drag={dragOver || undefined}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          add(e.dataTransfer.files);
        }}
      >
        {notice ? (
          <p className="pe-notice" role="status">
            {notice}
          </p>
        ) : null}

        <ul className="pe-gal-grid">
          {images.map((img, i) => (
            <li
              key={img.upload ?? img.id}
              draggable
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => dragIdx.current !== null && e.preventDefault()}
              onDrop={(e) => {
                if (dragIdx.current === null) return;
                e.preventDefault();
                e.stopPropagation();
                if (dragIdx.current !== i) move(dragIdx.current, i);
                dragIdx.current = null;
              }}
              onDragEnd={() => (dragIdx.current = null)}
            >
              <div className="pe-gal-item" title="Перетащите, чтобы поменять порядок">
                <img src={img.thumb || img.src} alt="" draggable={false} />
                <span className="pe-gal-num">{i + 1}</span>
                <button
                  type="button"
                  className="pe-gal-remove"
                  aria-label={`Убрать фото ${i + 1}`}
                  onClick={() => setImages((c) => c.filter((_, k) => k !== i))}
                >
                  <Close />
                </button>
              </div>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key}>
              <div className="pe-gal-item" data-state={p.error ? 'error' : 'upload'} title={p.error ?? p.name}>
                {p.error ? (
                  <span className="pe-gal-err">
                    {p.name}: {p.error}
                    <button type="button" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}>
                      Убрать
                    </button>
                  </span>
                ) : (
                  <span className="pe-gal-wait">
                    <span className="pe-spinner" aria-label="Обработка" />
                  </span>
                )}
              </div>
            </li>
          ))}
          {left > 0 ? (
            <li>
              <button type="button" className="pe-gal-add" onClick={() => inputRef.current?.click()}>
                <Upload />
                <span>Выбрать фото</span>
                <small>или перетащите сюда</small>
              </button>
            </li>
          ) : null}
        </ul>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = '';
          }}
        />
        {!images.length && !pending.length ? (
          <p className="pe-gal-empty">
            Выберите одно фото или несколько — несколько встанут в тексте галереей. Крупные снимки уменьшатся до {2560} px
            по длинной стороне.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
