import { useId, useState } from 'react';
import Dialog from './Dialog';

export interface LinkValue {
  href: string;
  text: string;
  newTab: boolean;
}

/** Ссылка: адрес, текст (если ничего не выделено) и где открывать — как окно старого редактора. */
export default function LinkDialog({
  initial,
  askText,
  onSubmit,
  onRemove,
  onClose,
}: {
  initial: LinkValue;
  /** выделения нет — нужен текст ссылки */
  askText: boolean;
  onSubmit: (v: LinkValue) => void;
  onRemove: (() => void) | null;
  onClose: () => void;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const href = v.href.trim();
  const valid = /^(https?:\/\/|mailto:|\/)\S+$/i.test(href) || /^[\w.-]+\.[a-zа-яё]{2,}(\/\S*)?$/i.test(href);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const full = /^(https?:\/\/|mailto:|\/)/i.test(href) ? href : `https://${href}`;
    onSubmit({ ...v, href: full, text: v.text.trim() || full });
  };

  return (
    <Dialog title={onRemove ? 'Ссылка' : 'Вставить ссылку'} onClose={onClose}>
      <form className="pe-form" onSubmit={submit}>
        <label className="pe-field" htmlFor={`${id}-url`}>
          <span className="pe-label">Адрес</span>
          <input
            id={`${id}-url`}
            className="pe-input"
            type="text"
            inputMode="url"
            placeholder="https://…"
            value={v.href}
            onChange={(e) => setV({ ...v, href: e.target.value })}
            autoFocus
            aria-invalid={href !== '' && !valid ? true : undefined}
          />
        </label>
        {askText ? (
          <label className="pe-field" htmlFor={`${id}-text`}>
            <span className="pe-label">Текст ссылки</span>
            <input
              id={`${id}-text`}
              className="pe-input"
              type="text"
              placeholder="Если пусто — будет адрес"
              value={v.text}
              onChange={(e) => setV({ ...v, text: e.target.value })}
            />
          </label>
        ) : null}
        <label className="pe-check">
          <input type="checkbox" checked={v.newTab} onChange={(e) => setV({ ...v, newTab: e.target.checked })} />
          <span>Открывать в новой вкладке</span>
        </label>
        <div className="pe-d-actions">
          {onRemove ? (
            <button type="button" className="pe-btn pe-btn-ghost pe-btn-left" onClick={onRemove}>
              Убрать ссылку
            </button>
          ) : null}
          <button type="button" className="pe-btn pe-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="pe-btn pe-btn-primary" disabled={!valid}>
            {onRemove ? 'Сохранить' : 'Вставить'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
