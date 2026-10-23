import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Close } from '../icons';

/**
 * Окно — нативный <dialog> (showModal): затемнение, фокус и Esc от браузера.
 * size: обычное (480), wide (880 — галерея); на телефоне — «шторка» снизу.
 */
export default function Dialog({
  title,
  onClose,
  children,
  footer,
  size,
  busy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'wide';
  /** идёт запрос — Esc и клик мимо не закрывают */
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className="pe-dialog"
      data-size={size}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="pe-d-head">
        <h2 className="pe-d-title">{title}</h2>
        <button type="button" className="pe-d-close" aria-label="Закрыть" onClick={onClose} disabled={busy}>
          <Close />
        </button>
      </div>
      <div className="pe-d-body">{children}</div>
      {footer ? <div className="pe-d-foot">{footer}</div> : null}
    </dialog>,
    document.body,
  );
}
